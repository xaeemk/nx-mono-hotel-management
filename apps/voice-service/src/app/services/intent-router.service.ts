import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { IntentDetectionDto, IntentResult, IntentType } from '../dto/voice.dto';
import { environment } from '../../environments/environment';

@Injectable()
export class IntentRouterService {
  private readonly logger = new Logger(IntentRouterService.name);
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: environment.openai.apiKey,
    });
  }

  async detectIntent(data: IntentDetectionDto): Promise<IntentResult> {
    const { transcript, callSid, conversationContext } = data;

    this.logger.log(
      `Detecting intent for call ${callSid}: "${transcript.substring(
        0,
        100
      )}..."`
    );

    try {
      const systemPrompt = this.buildSystemPrompt();
      const userMessage = this.buildUserMessage(
        transcript,
        conversationContext
      );

      const response = await this.openai.chat.completions.create({
        model: environment.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        functions: this.getIntentFunctions(),
        function_call: { name: 'classify_hotel_intent' },
        temperature: 0.3,
        max_tokens: 1000,
      });

      const functionCall = response.choices[0]?.message?.function_call;

      if (!functionCall || functionCall.name !== 'classify_hotel_intent') {
        throw new Error('Failed to get intent classification from OpenAI');
      }

      const functionResult = JSON.parse(functionCall.arguments);

      const intentResult: IntentResult = {
        intent: functionResult.intent as IntentType,
        confidence: functionResult.confidence,
        parameters: functionResult.parameters || {},
        response: functionResult.response,
        nextAction: functionResult.next_action
          ? {
              type: functionResult.next_action.type,
              data: functionResult.next_action.data,
            }
          : undefined,
      };

      this.logger.log(
        `Intent detected for call ${callSid}: ${intentResult.intent} (confidence: ${intentResult.confidence})`
      );

      return intentResult;
    } catch (error) {
      this.logger.error(
        `Intent detection failed for call ${callSid}: ${error.message}`,
        error.stack
      );

      // Fallback to simple keyword-based classification
      return this.fallbackIntentDetection(transcript);
    }
  }

  private buildSystemPrompt(): string {
    return `You are an intelligent voice assistant for a luxury hotel. Your role is to analyze guest phone calls and determine their intent.

Hotel Context:
- This is a premium hotel with rooms, suites, and amenities
- Services include: room service, housekeeping, concierge, spa, restaurant, business center
- Common requests: reservations, check-in/out, room issues, amenities, local information
- Guest satisfaction is paramount - be helpful and professional

Instructions:
1. Analyze the guest's message to determine their primary intent
2. Extract relevant parameters (dates, room types, preferences, etc.)
3. Provide an appropriate response based on the intent
4. Determine the next action needed to help the guest
5. Be empathetic and professional in your responses

Consider conversation context and previous interactions when available.`;
  }

  private buildUserMessage(
    transcript: string,
    conversationContext?: string
  ): string {
    let message = `Guest says: "${transcript}"`;

    if (conversationContext) {
      message += `\n\nConversation context: ${conversationContext}`;
    }

    return message;
  }

  private getIntentFunctions() {
    return [
      {
        name: 'classify_hotel_intent',
        description:
          "Classify the guest's intent and extract relevant parameters",
        parameters: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              enum: [
                'make_reservation',
                'check_availability',
                'modify_reservation',
                'cancel_reservation',
                'inquire_amenities',
                'check_in_status',
                'room_service',
                'housekeeping_request',
                'complaint',
                'general_inquiry',
                'transfer_human',
              ],
              description: "The primary intent of the guest's message",
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description:
                'Confidence score for the intent classification (0-1)',
            },
            parameters: {
              type: 'object',
              properties: {
                dates: {
                  type: 'object',
                  properties: {
                    check_in: { type: 'string', format: 'date' },
                    check_out: { type: 'string', format: 'date' },
                  },
                },
                room_preferences: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['standard', 'deluxe', 'suite', 'presidential'],
                    },
                    bed_type: {
                      type: 'string',
                      enum: ['single', 'double', 'queen', 'king'],
                    },
                    smoking: { type: 'boolean' },
                    accessible: { type: 'boolean' },
                    floor_preference: {
                      type: 'string',
                      enum: ['low', 'high', 'specific'],
                    },
                  },
                },
                guest_info: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    adults: { type: 'number' },
                    children: { type: 'number' },
                    special_requests: { type: 'string' },
                  },
                },
                reservation_details: {
                  type: 'object',
                  properties: {
                    confirmation_number: { type: 'string' },
                    guest_name: { type: 'string' },
                  },
                },
                service_request: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    urgency: {
                      type: 'string',
                      enum: ['low', 'medium', 'high', 'urgent'],
                    },
                    room_number: { type: 'string' },
                    details: { type: 'string' },
                  },
                },
                amenity_type: {
                  type: 'string',
                  enum: [
                    'spa',
                    'fitness',
                    'pool',
                    'restaurant',
                    'business_center',
                    'wifi',
                    'parking',
                    'concierge',
                  ],
                },
                complaint_details: {
                  type: 'object',
                  properties: {
                    category: {
                      type: 'string',
                      enum: [
                        'room',
                        'service',
                        'noise',
                        'cleanliness',
                        'billing',
                        'other',
                      ],
                    },
                    severity: {
                      type: 'string',
                      enum: ['minor', 'moderate', 'serious'],
                    },
                    description: { type: 'string' },
                  },
                },
              },
              description: 'Extracted parameters relevant to the intent',
            },
            response: {
              type: 'string',
              description:
                'Appropriate response to the guest based on their intent',
            },
            next_action: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['transfer', 'continue', 'end', 'collect_info'],
                  description: 'Next action to take in the conversation',
                },
                data: {
                  type: 'object',
                  description: 'Additional data for the next action',
                },
              },
              description: 'Recommended next action for the conversation flow',
            },
          },
          required: ['intent', 'confidence', 'response'],
        },
      },
    ];
  }

  private fallbackIntentDetection(transcript: string): IntentResult {
    const lowerTranscript = transcript.toLowerCase();

    // Simple keyword-based fallback classification
    if (
      this.containsKeywords(lowerTranscript, [
        'book',
        'reserve',
        'reservation',
        'availability',
      ])
    ) {
      return {
        intent: IntentType.MAKE_RESERVATION,
        confidence: 0.6,
        response:
          'I can help you with a reservation. Could you please tell me your preferred dates?',
        nextAction: {
          type: 'collect_info',
          data: { needed: ['dates', 'guests'] },
        },
      };
    }

    if (this.containsKeywords(lowerTranscript, ['cancel', 'cancellation'])) {
      return {
        intent: IntentType.CANCEL_RESERVATION,
        confidence: 0.7,
        response:
          'I can help you cancel your reservation. May I have your confirmation number?',
        nextAction: {
          type: 'collect_info',
          data: { needed: ['confirmation_number'] },
        },
      };
    }

    if (
      this.containsKeywords(lowerTranscript, [
        'room service',
        'food',
        'order',
        'menu',
      ])
    ) {
      return {
        intent: IntentType.ROOM_SERVICE,
        confidence: 0.8,
        response:
          'I can help you with room service. What would you like to order?',
        nextAction: { type: 'transfer', data: { department: 'room_service' } },
      };
    }

    if (
      this.containsKeywords(lowerTranscript, [
        'housekeeping',
        'cleaning',
        'towels',
        'linens',
      ])
    ) {
      return {
        intent: IntentType.HOUSEKEEPING_REQUEST,
        confidence: 0.8,
        response:
          'I can arrange housekeeping for you. What do you need assistance with?',
        nextAction: { type: 'continue' },
      };
    }

    if (
      this.containsKeywords(lowerTranscript, [
        'problem',
        'issue',
        'complaint',
        'not working',
      ])
    ) {
      return {
        intent: IntentType.COMPLAINT,
        confidence: 0.7,
        response:
          "I apologize for any inconvenience. Could you please describe the issue you're experiencing?",
        nextAction: {
          type: 'collect_info',
          data: { needed: ['complaint_details'] },
        },
      };
    }

    if (
      this.containsKeywords(lowerTranscript, [
        'human',
        'person',
        'agent',
        'manager',
        'speak to someone',
      ])
    ) {
      return {
        intent: IntentType.TRANSFER_HUMAN,
        confidence: 0.9,
        response:
          "I'll connect you with one of our team members. Please hold while I transfer your call.",
        nextAction: { type: 'transfer', data: { department: 'front_desk' } },
      };
    }

    // Default to general inquiry
    return {
      intent: IntentType.GENERAL_INQUIRY,
      confidence: 0.5,
      response: 'Thank you for calling. How may I assist you today?',
      nextAction: { type: 'continue' },
    };
  }

  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Get intent-specific response templates
   */
  getResponseTemplates(): Record<IntentType, string[]> {
    return {
      [IntentType.MAKE_RESERVATION]: [
        "I'd be happy to help you make a reservation. What dates are you looking for?",
        'Let me help you book a room. When would you like to stay with us?',
        'I can assist with your reservation. Could you please provide your check-in and check-out dates?',
      ],
      [IntentType.CHECK_AVAILABILITY]: [
        'Let me check our availability for you. What dates are you interested in?',
        'I can check room availability. Please let me know your preferred dates.',
        "I'll be happy to check what rooms we have available. When are you planning to stay?",
      ],
      [IntentType.MODIFY_RESERVATION]: [
        'I can help modify your reservation. What changes would you like to make?',
        'Let me assist with updating your booking. What needs to be changed?',
        "I'll help you modify your reservation. Please provide your confirmation number.",
      ],
      [IntentType.CANCEL_RESERVATION]: [
        'I can help you cancel your reservation. May I have your confirmation number?',
        "I'll assist with the cancellation. Could you please provide your booking details?",
        "Let me help you cancel your booking. What's your confirmation number?",
      ],
      [IntentType.INQUIRE_AMENITIES]: [
        "I'd be happy to tell you about our amenities. What would you like to know about?",
        'We have many wonderful amenities. Which ones are you interested in?',
        'Let me help you learn about our facilities. What specific amenities are you asking about?',
      ],
      [IntentType.CHECK_IN_STATUS]: [
        "I can check your check-in status. What's your confirmation number?",
        'Let me help you with check-in information. May I have your booking reference?',
        "I'll check your check-in details. Could you provide your reservation number?",
      ],
      [IntentType.ROOM_SERVICE]: [
        'I can help you with room service. What would you like to order?',
        'Let me connect you with room service. What can we prepare for you?',
        "I'll assist with your room service request. What would you like?",
      ],
      [IntentType.HOUSEKEEPING_REQUEST]: [
        'I can arrange housekeeping for you. What do you need?',
        'Let me help with your housekeeping request. What assistance do you need?',
        "I'll coordinate housekeeping services. What can we help you with?",
      ],
      [IntentType.COMPLAINT]: [
        'I apologize for any inconvenience. Could you please describe the issue?',
        "I'm sorry to hear about the problem. Let me help resolve this for you.",
        'I understand your concern. Please tell me more about the issue so I can assist you.',
      ],
      [IntentType.GENERAL_INQUIRY]: [
        'How may I assist you today?',
        'What can I help you with?',
        'Thank you for calling. How can I be of service?',
      ],
      [IntentType.TRANSFER_HUMAN]: [
        "I'll connect you with one of our team members. Please hold.",
        'Let me transfer you to a member of our staff who can assist you further.',
        "I'll get someone to help you right away. Please hold while I connect you.",
      ],
    };
  }
}
