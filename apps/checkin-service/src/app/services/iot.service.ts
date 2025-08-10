import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import axios, { AxiosInstance } from 'axios';
import Redis from 'ioredis';

export interface DoorLockDevice {
  deviceId: string;
  roomNumber: string;
  deviceType: 'mqtt' | 'http';
  endpoint?: string; // HTTP endpoint or MQTT topic
  status: 'online' | 'offline' | 'error';
  lastSeen: Date;
  batteryLevel?: number;
  firmwareVersion?: string;
  capabilities: string[];
}

export interface DoorLockCommand {
  deviceId: string;
  command:
    | 'unlock'
    | 'lock'
    | 'status'
    | 'activate_key'
    | 'deactivate_key'
    | 'emergency_unlock';
  parameters?: Record<string, any>;
  timeout?: number;
}

export interface DoorLockResponse {
  deviceId: string;
  command: string;
  success: boolean;
  status?: 'locked' | 'unlocked' | 'error';
  message?: string;
  timestamp: Date;
  batteryLevel?: number;
}

@Injectable()
export class IoTService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IoTService.name);
  private readonly redis: Redis;
  private mqttClient: mqtt.MqttClient | null = null;
  private httpClient: AxiosInstance;
  private readonly devices = new Map<string, DoorLockDevice>();
  private readonly pendingCommands = new Map<
    string,
    {
      resolve: (value: DoorLockResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_IOT_DB', 6),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hotel-IoT-Service/1.0',
      },
    });
  }

  async onModuleInit() {
    await this.initializeMqttClient();
    await this.loadDeviceRegistry();
    await this.startDeviceHealthMonitoring();
  }

  async onModuleDestroy() {
    if (this.mqttClient) {
      this.mqttClient.end();
    }
    await this.redis.disconnect();
  }

  private async initializeMqttClient() {
    const mqttUrl = this.configService.get('MQTT_URL', 'mqtt://localhost:1883');
    const mqttUsername = this.configService.get('MQTT_USERNAME');
    const mqttPassword = this.configService.get('MQTT_PASSWORD');

    try {
      this.mqttClient = mqtt.connect(mqttUrl, {
        username: mqttUsername,
        password: mqttPassword,
        clientId: `hotel-iot-service-${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000,
        keepalive: 60,
      });

      this.mqttClient.on('connect', () => {
        this.logger.log('Connected to MQTT broker');
        this.subscribeToTopics();
      });

      this.mqttClient.on('message', (topic, message) => {
        this.handleMqttMessage(topic, message.toString());
      });

      this.mqttClient.on('error', (error) => {
        this.logger.error('MQTT connection error:', error);
      });

      this.mqttClient.on('disconnect', () => {
        this.logger.warn('Disconnected from MQTT broker');
      });
    } catch (error) {
      this.logger.error('Failed to initialize MQTT client:', error);
    }
  }

  private subscribeToTopics() {
    if (!this.mqttClient) return;

    const topics = [
      'hotel/rooms/+/lock/status',
      'hotel/rooms/+/lock/response',
      'hotel/rooms/+/lock/heartbeat',
      'hotel/rooms/+/lock/battery',
      'hotel/rooms/+/lock/error',
    ];

    topics.forEach((topic) => {
      this.mqttClient!.subscribe(topic, (err) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${topic}:`, err);
        } else {
          this.logger.log(`Subscribed to ${topic}`);
        }
      });
    });
  }

  private handleMqttMessage(topic: string, message: string) {
    try {
      const topicParts = topic.split('/');
      const roomNumber = topicParts[2];
      const messageType = topicParts[4];
      const deviceId = `mqtt_${roomNumber}`;

      let payload;
      try {
        payload = JSON.parse(message);
      } catch {
        payload = { message };
      }

      switch (messageType) {
        case 'status':
          this.handleDeviceStatus(deviceId, payload);
          break;
        case 'response':
          this.handleCommandResponse(deviceId, payload);
          break;
        case 'heartbeat':
          this.handleDeviceHeartbeat(deviceId, payload);
          break;
        case 'battery':
          this.handleBatteryUpdate(deviceId, payload);
          break;
        case 'error':
          this.handleDeviceError(deviceId, payload);
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling MQTT message from ${topic}:`, error);
    }
  }

  async registerDevice(
    device: Omit<DoorLockDevice, 'status' | 'lastSeen'>
  ): Promise<void> {
    const deviceWithStatus: DoorLockDevice = {
      ...device,
      status: 'offline',
      lastSeen: new Date(),
    };

    this.devices.set(device.deviceId, deviceWithStatus);
    await this.redis.hset(
      'iot:devices',
      device.deviceId,
      JSON.stringify(deviceWithStatus)
    );

    this.logger.log(
      `Registered device ${device.deviceId} for room ${device.roomNumber}`
    );
  }

  async sendCommand(command: DoorLockCommand): Promise<DoorLockResponse> {
    const device = this.devices.get(command.deviceId);
    if (!device) {
      throw new Error(`Device ${command.deviceId} not found`);
    }

    if (device.status === 'offline') {
      throw new Error(`Device ${command.deviceId} is offline`);
    }

    return new Promise((resolve, reject) => {
      const commandId = `${command.deviceId}_${Date.now()}`;
      const timeout = command.timeout || 30000;

      // Store pending command
      const timeoutHandle = setTimeout(() => {
        this.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout for device ${command.deviceId}`));
      }, timeout);

      this.pendingCommands.set(commandId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      // Send command based on device type
      if (device.deviceType === 'mqtt') {
        this.sendMqttCommand(device, command, commandId);
      } else {
        this.sendHttpCommand(device, command, commandId);
      }
    });
  }

  private async sendMqttCommand(
    device: DoorLockDevice,
    command: DoorLockCommand,
    commandId: string
  ) {
    if (!this.mqttClient) {
      throw new Error('MQTT client not connected');
    }

    const topic = `hotel/rooms/${device.roomNumber}/lock/command`;
    const payload = {
      commandId,
      command: command.command,
      parameters: command.parameters || {},
      timestamp: new Date().toISOString(),
    };

    this.mqttClient.publish(topic, JSON.stringify(payload), (error) => {
      if (error) {
        this.logger.error(
          `Failed to send MQTT command to ${device.deviceId}:`,
          error
        );
        const pendingCommand = this.pendingCommands.get(commandId);
        if (pendingCommand) {
          clearTimeout(pendingCommand.timeout);
          this.pendingCommands.delete(commandId);
          pendingCommand.reject(
            new Error(`Failed to send command: ${error.message}`)
          );
        }
      } else {
        this.logger.log(
          `Sent MQTT command ${command.command} to ${device.deviceId}`
        );
      }
    });
  }

  private async sendHttpCommand(
    device: DoorLockDevice,
    command: DoorLockCommand,
    commandId: string
  ) {
    if (!device.endpoint) {
      throw new Error(
        `No HTTP endpoint configured for device ${device.deviceId}`
      );
    }

    try {
      const response = await this.httpClient.post(device.endpoint, {
        commandId,
        command: command.command,
        parameters: command.parameters || {},
        timestamp: new Date().toISOString(),
      });

      // Handle immediate HTTP response
      const pendingCommand = this.pendingCommands.get(commandId);
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeout);
        this.pendingCommands.delete(commandId);

        const doorLockResponse: DoorLockResponse = {
          deviceId: device.deviceId,
          command: command.command,
          success: response.data.success || response.status === 200,
          status: response.data.status,
          message: response.data.message,
          timestamp: new Date(),
          batteryLevel: response.data.batteryLevel,
        };

        pendingCommand.resolve(doorLockResponse);
      }

      this.logger.log(
        `Sent HTTP command ${command.command} to ${device.deviceId}`
      );
    } catch (error) {
      const pendingCommand = this.pendingCommands.get(commandId);
      if (pendingCommand) {
        clearTimeout(pendingCommand.timeout);
        this.pendingCommands.delete(commandId);
        pendingCommand.reject(error);
      }
      throw error;
    }
  }

  private handleCommandResponse(deviceId: string, payload: any) {
    const commandId = payload.commandId;
    const pendingCommand = this.pendingCommands.get(commandId);

    if (pendingCommand) {
      clearTimeout(pendingCommand.timeout);
      this.pendingCommands.delete(commandId);

      const response: DoorLockResponse = {
        deviceId,
        command: payload.command,
        success: payload.success || false,
        status: payload.status,
        message: payload.message,
        timestamp: new Date(),
        batteryLevel: payload.batteryLevel,
      };

      pendingCommand.resolve(response);
    }
  }

  private handleDeviceStatus(deviceId: string, payload: any) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.status = 'online';
      device.lastSeen = new Date();
      if (payload.batteryLevel !== undefined) {
        device.batteryLevel = payload.batteryLevel;
      }
      this.updateDeviceInRedis(deviceId, device);
    }
  }

  private handleDeviceHeartbeat(deviceId: string, payload: any) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.status = 'online';
      device.lastSeen = new Date();
      if (payload.batteryLevel !== undefined) {
        device.batteryLevel = payload.batteryLevel;
      }
      if (payload.firmwareVersion) {
        device.firmwareVersion = payload.firmwareVersion;
      }
      this.updateDeviceInRedis(deviceId, device);
    }
  }

  private handleBatteryUpdate(deviceId: string, payload: any) {
    const device = this.devices.get(deviceId);
    if (device && payload.batteryLevel !== undefined) {
      device.batteryLevel = payload.batteryLevel;
      device.lastSeen = new Date();
      this.updateDeviceInRedis(deviceId, device);

      // Alert if battery is low
      if (payload.batteryLevel < 20) {
        this.logger.warn(
          `Low battery alert for device ${deviceId}: ${payload.batteryLevel}%`
        );
        this.publishLowBatteryAlert(deviceId, device, payload.batteryLevel);
      }
    }
  }

  private handleDeviceError(deviceId: string, payload: any) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.status = 'error';
      device.lastSeen = new Date();
      this.updateDeviceInRedis(deviceId, device);

      this.logger.error(`Device error for ${deviceId}:`, payload);
      this.publishDeviceAlert(deviceId, device, 'error', payload.message);
    }
  }

  private async updateDeviceInRedis(deviceId: string, device: DoorLockDevice) {
    await this.redis.hset('iot:devices', deviceId, JSON.stringify(device));
  }

  private async loadDeviceRegistry() {
    try {
      const devices = await this.redis.hgetall('iot:devices');
      for (const [deviceId, deviceData] of Object.entries(devices)) {
        try {
          const device = JSON.parse(deviceData) as DoorLockDevice;
          device.lastSeen = new Date(device.lastSeen);
          this.devices.set(deviceId, device);
        } catch (error) {
          this.logger.error(
            `Failed to parse device data for ${deviceId}:`,
            error
          );
        }
      }
      this.logger.log(`Loaded ${this.devices.size} devices from registry`);
    } catch (error) {
      this.logger.error('Failed to load device registry:', error);
    }
  }

  private startDeviceHealthMonitoring() {
    setInterval(() => {
      this.checkDeviceHealth();
    }, 60000); // Check every minute
  }

  private async checkDeviceHealth() {
    const now = new Date();
    const offlineThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [deviceId, device] of this.devices) {
      const timeSinceLastSeen = now.getTime() - device.lastSeen.getTime();

      if (timeSinceLastSeen > offlineThreshold && device.status !== 'offline') {
        device.status = 'offline';
        await this.updateDeviceInRedis(deviceId, device);
        this.logger.warn(`Device ${deviceId} marked as offline`);
        this.publishDeviceAlert(
          deviceId,
          device,
          'offline',
          'Device not responding'
        );
      }
    }
  }

  private async publishLowBatteryAlert(
    deviceId: string,
    device: DoorLockDevice,
    batteryLevel: number
  ) {
    const alert = {
      type: 'LOW_BATTERY',
      deviceId,
      roomNumber: device.roomNumber,
      batteryLevel,
      timestamp: new Date(),
      severity: batteryLevel < 10 ? 'critical' : 'warning',
    };

    await this.redis.publish('iot:alerts', JSON.stringify(alert));
  }

  private async publishDeviceAlert(
    deviceId: string,
    device: DoorLockDevice,
    alertType: string,
    message: string
  ) {
    const alert = {
      type: 'DEVICE_ALERT',
      alertType,
      deviceId,
      roomNumber: device.roomNumber,
      message,
      timestamp: new Date(),
      severity: alertType === 'offline' ? 'warning' : 'error',
    };

    await this.redis.publish('iot:alerts', JSON.stringify(alert));
  }

  // Public API methods

  async unlockRoom(
    roomNumber: string,
    reservationId?: string
  ): Promise<DoorLockResponse> {
    const deviceId = await this.findDeviceByRoomNumber(roomNumber);
    return this.sendCommand({
      deviceId,
      command: 'unlock',
      parameters: { reservationId, duration: 5000 }, // Auto-lock after 5 seconds
    });
  }

  async lockRoom(roomNumber: string): Promise<DoorLockResponse> {
    const deviceId = await this.findDeviceByRoomNumber(roomNumber);
    return this.sendCommand({
      deviceId,
      command: 'lock',
    });
  }

  async activateKeyAccess(
    roomNumber: string,
    keyId: string,
    validUntil?: Date
  ): Promise<DoorLockResponse> {
    const deviceId = await this.findDeviceByRoomNumber(roomNumber);
    return this.sendCommand({
      deviceId,
      command: 'activate_key',
      parameters: {
        keyId,
        validUntil: validUntil?.toISOString(),
      },
    });
  }

  async deactivateKeyAccess(
    roomNumber: string,
    keyId: string
  ): Promise<DoorLockResponse> {
    const deviceId = await this.findDeviceByRoomNumber(roomNumber);
    return this.sendCommand({
      deviceId,
      command: 'deactivate_key',
      parameters: { keyId },
    });
  }

  async getRoomLockStatus(roomNumber: string): Promise<DoorLockResponse> {
    const deviceId = await this.findDeviceByRoomNumber(roomNumber);
    return this.sendCommand({
      deviceId,
      command: 'status',
    });
  }

  async getDeviceInfo(deviceId: string): Promise<DoorLockDevice | null> {
    return this.devices.get(deviceId) || null;
  }

  async getAllDevices(): Promise<DoorLockDevice[]> {
    return Array.from(this.devices.values());
  }

  async getDevicesByStatus(
    status: DoorLockDevice['status']
  ): Promise<DoorLockDevice[]> {
    return Array.from(this.devices.values()).filter(
      (device) => device.status === status
    );
  }

  private async findDeviceByRoomNumber(roomNumber: string): Promise<string> {
    for (const [deviceId, device] of this.devices) {
      if (device.roomNumber === roomNumber) {
        return deviceId;
      }
    }
    throw new Error(`No door lock device found for room ${roomNumber}`);
  }
}
