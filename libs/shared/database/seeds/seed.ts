import { db, withAuditContext } from '../src';
import {
  RoomType,
  RoomStatus,
  GuestType,
  ReservationStatus,
  PaymentStatus,
  PaymentMethod,
  LedgerEntryType,
} from '../src/generated/client';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  try {
    await withAuditContext(
      {
        userId: 'system',
        userAgent: 'seed-script',
        ipAddress: '127.0.0.1',
        sessionId: 'seed-session',
      },
      async () => {
        // Seed Guests
        console.log('👥 Seeding guests...');
        const guests = await Promise.all([
          db.guest.create({
            data: {
              guestType: GuestType.INDIVIDUAL,
              firstName: 'John',
              lastName: 'Doe',
              email: 'john.doe@example.com',
              phone: '+1-555-123-4567',
              dateOfBirth: new Date('1985-06-15'),
              addressLine1: '123 Main St',
              city: 'New York',
              state: 'NY',
              postalCode: '10001',
              country: 'USA',
              marketingOptIn: true,
              createdBy: 'system',
            },
          }),
          db.guest.create({
            data: {
              guestType: GuestType.CORPORATE,
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane.smith@acme.com',
              phone: '+1-555-987-6543',
              companyName: 'Acme Corporation',
              taxId: 'TAX123456789',
              addressLine1: '456 Business Blvd',
              city: 'Chicago',
              state: 'IL',
              postalCode: '60601',
              country: 'USA',
              loyaltyNumber: 'LOYALTY001',
              marketingOptIn: false,
              createdBy: 'system',
            },
          }),
          db.guest.create({
            data: {
              guestType: GuestType.VIP,
              firstName: 'Robert',
              lastName: 'Johnson',
              email: 'robert.johnson@vip.com',
              phone: '+1-555-555-5555',
              dateOfBirth: new Date('1975-12-25'),
              addressLine1: '789 Luxury Ave',
              city: 'Beverly Hills',
              state: 'CA',
              postalCode: '90210',
              country: 'USA',
              loyaltyNumber: 'VIP001',
              preferences: {
                roomFloor: 'high',
                bedType: 'king',
                pillowType: 'hypoallergenic',
                dietaryRestrictions: ['vegetarian'],
              },
              specialRequests: 'Late checkout preferred',
              marketingOptIn: true,
              createdBy: 'system',
            },
          }),
        ]);

        // Seed Rooms
        console.log('🏨 Seeding rooms...');
        const rooms = await Promise.all([
          // Standard rooms
          ...Array.from({ length: 10 }, (_, i) =>
            db.room.create({
              data: {
                roomNumber: `10${i + 1}`,
                roomType: RoomType.STANDARD,
                status: RoomStatus.AVAILABLE,
                floor: 1,
                maxOccupancy: 2,
                bedCount: 1,
                bedType: 'Queen',
                amenities: {
                  wifi: true,
                  tv: true,
                  airConditioning: true,
                  minibar: false,
                },
                area: 250,
                hasBalcony: false,
                hasKitchen: false,
                isAccessible: i < 2, // First 2 rooms are accessible
                smokingAllowed: false,
                baseRate: 120.0,
                currency: 'USD',
                createdBy: 'system',
              },
            })
          ),
          // Deluxe rooms
          ...Array.from({ length: 5 }, (_, i) =>
            db.room.create({
              data: {
                roomNumber: `20${i + 1}`,
                roomType: RoomType.DELUXE,
                status: RoomStatus.AVAILABLE,
                floor: 2,
                maxOccupancy: 3,
                bedCount: 1,
                bedType: 'King',
                amenities: {
                  wifi: true,
                  tv: true,
                  airConditioning: true,
                  minibar: true,
                  coffeemaker: true,
                  balcony: true,
                },
                area: 350,
                hasBalcony: true,
                hasKitchen: false,
                isAccessible: false,
                smokingAllowed: false,
                baseRate: 180.0,
                currency: 'USD',
                createdBy: 'system',
              },
            })
          ),
          // Suites
          ...Array.from({ length: 3 }, (_, i) =>
            db.room.create({
              data: {
                roomNumber: `30${i + 1}`,
                roomType: RoomType.SUITE,
                status: RoomStatus.AVAILABLE,
                floor: 3,
                maxOccupancy: 4,
                bedCount: 2,
                bedType: 'King + Sofa Bed',
                amenities: {
                  wifi: true,
                  tv: true,
                  airConditioning: true,
                  minibar: true,
                  coffeemaker: true,
                  balcony: true,
                  kitchenette: true,
                  livingArea: true,
                },
                area: 550,
                hasBalcony: true,
                hasKitchen: true,
                isAccessible: false,
                smokingAllowed: false,
                baseRate: 300.0,
                currency: 'USD',
                createdBy: 'system',
              },
            })
          ),
        ]);

        // Seed Rate Plans
        console.log('💰 Seeding rate plans...');
        const ratePlans = await Promise.all([
          db.ratePlan.create({
            data: {
              name: 'Standard Rate',
              code: 'STD',
              description: 'Our standard flexible rate',
              baseRate: 100.0,
              currency: 'USD',
              validFrom: new Date('2024-01-01'),
              validTo: new Date('2024-12-31'),
              minimumStay: 1,
              weekdayMultiplier: 1.0,
              weekendMultiplier: 1.2,
              holidayMultiplier: 1.5,
              isRefundable: true,
              cancellationHours: 24,
              prepaymentRequired: false,
              inclusions: {
                wifi: true,
                breakfast: false,
                parking: false,
              },
              isActive: true,
              isPublic: true,
              createdBy: 'system',
            },
          }),
          db.ratePlan.create({
            data: {
              name: 'Advance Purchase',
              code: 'ADV30',
              description: '30-day advance purchase with 15% discount',
              baseRate: 85.0,
              currency: 'USD',
              validFrom: new Date('2024-01-01'),
              validTo: new Date('2024-12-31'),
              minimumStay: 2,
              advanceBooking: 30,
              weekdayMultiplier: 1.0,
              weekendMultiplier: 1.2,
              holidayMultiplier: 1.5,
              isRefundable: false,
              cancellationHours: 0,
              prepaymentRequired: true,
              inclusions: {
                wifi: true,
                breakfast: true,
                parking: false,
              },
              isActive: true,
              isPublic: true,
              createdBy: 'system',
            },
          }),
          db.ratePlan.create({
            data: {
              name: 'Corporate Rate',
              code: 'CORP',
              description: 'Special rate for corporate clients',
              baseRate: 90.0,
              currency: 'USD',
              validFrom: new Date('2024-01-01'),
              validTo: new Date('2024-12-31'),
              minimumStay: 1,
              weekdayMultiplier: 1.0,
              weekendMultiplier: 1.0,
              holidayMultiplier: 1.2,
              isRefundable: true,
              cancellationHours: 48,
              prepaymentRequired: false,
              inclusions: {
                wifi: true,
                breakfast: true,
                parking: true,
              },
              restrictions: {
                corporateIdRequired: true,
              },
              isActive: true,
              isPublic: false,
              createdBy: 'system',
            },
          }),
        ]);

        // Create Room-Rate Plan associations
        console.log('🔗 Creating room-rate plan associations...');
        const standardRooms = rooms.filter(
          (r) => r.roomType === RoomType.STANDARD
        );
        const deluxeRooms = rooms.filter((r) => r.roomType === RoomType.DELUXE);
        const suites = rooms.filter((r) => r.roomType === RoomType.SUITE);

        // Associate standard rate with all rooms
        for (const room of rooms) {
          await db.roomRatePlan.create({
            data: {
              roomId: room.id,
              ratePlanId: ratePlans[0].id, // Standard Rate
              isActive: true,
            },
          });
        }

        // Associate advance purchase with standard and deluxe rooms
        for (const room of [...standardRooms, ...deluxeRooms]) {
          await db.roomRatePlan.create({
            data: {
              roomId: room.id,
              ratePlanId: ratePlans[1].id, // Advance Purchase
              overrideRate: room.baseRate * 0.85, // 15% discount
              isActive: true,
            },
          });
        }

        // Associate corporate rate with all rooms
        for (const room of rooms) {
          await db.roomRatePlan.create({
            data: {
              roomId: room.id,
              ratePlanId: ratePlans[2].id, // Corporate Rate
              overrideRate: room.baseRate * 0.9, // 10% discount
              isActive: true,
            },
          });
        }

        // Seed Reservations
        console.log('📅 Seeding reservations...');
        const reservations = await Promise.all([
          // Current reservation for John Doe
          db.reservation.create({
            data: {
              reservationNumber: 'RES-001-2024',
              status: ReservationStatus.CONFIRMED,
              guestId: guests[0].id,
              roomId: standardRooms[0].id,
              ratePlanId: ratePlans[0].id,
              checkInDate: new Date('2024-08-15'),
              checkOutDate: new Date('2024-08-18'),
              nights: 3,
              adults: 2,
              children: 0,
              infants: 0,
              roomRate: 120.0,
              totalAmount: 380.88, // 3 nights * 120 + taxes
              taxAmount: 20.88,
              fees: 0,
              discountAmount: 0,
              currency: 'USD',
              bookedBy: 'system',
              source: 'website',
              specialRequests: 'Late arrival expected',
              createdBy: 'system',
            },
          }),
          // Future reservation for Jane Smith (Corporate)
          db.reservation.create({
            data: {
              reservationNumber: 'RES-002-2024',
              status: ReservationStatus.CONFIRMED,
              guestId: guests[1].id,
              roomId: deluxeRooms[0].id,
              ratePlanId: ratePlans[2].id,
              checkInDate: new Date('2024-09-01'),
              checkOutDate: new Date('2024-09-05'),
              nights: 4,
              adults: 1,
              children: 0,
              infants: 0,
              roomRate: 162.0, // Corporate rate discount
              totalAmount: 691.44, // 4 nights * 162 + taxes
              taxAmount: 43.44,
              fees: 0,
              discountAmount: 18.0,
              currency: 'USD',
              bookedBy: 'system',
              source: 'corporate',
              internalNotes: 'Corporate booking - Acme Corporation',
              createdBy: 'system',
            },
          }),
          // VIP reservation
          db.reservation.create({
            data: {
              reservationNumber: 'RES-003-2024',
              status: ReservationStatus.PENDING,
              guestId: guests[2].id,
              roomId: suites[0].id,
              ratePlanId: ratePlans[0].id,
              checkInDate: new Date('2024-10-15'),
              checkOutDate: new Date('2024-10-20'),
              nights: 5,
              adults: 2,
              children: 1,
              infants: 0,
              roomRate: 300.0,
              totalAmount: 1620.0, // 5 nights * 300 + taxes
              taxAmount: 120.0,
              fees: 0,
              discountAmount: 0,
              currency: 'USD',
              bookedBy: 'concierge',
              source: 'phone',
              specialRequests: 'VIP amenities, champagne on arrival',
              guestNotes: 'Anniversary celebration',
              createdBy: 'system',
            },
          }),
        ]);

        // Seed Payments
        console.log('💳 Seeding payments...');
        const payments = await Promise.all([
          db.payment.create({
            data: {
              paymentNumber: 'PAY-001-2024',
              status: PaymentStatus.COMPLETED,
              method: PaymentMethod.CREDIT_CARD,
              amount: 380.88,
              currency: 'USD',
              guestId: guests[0].id,
              reservationId: reservations[0].id,
              transactionId: 'txn_1234567890',
              authorizationCode: 'AUTH123',
              authorizedAt: new Date(),
              settledAt: new Date(),
              cardLast4: '1234',
              cardBrand: 'Visa',
              cardExpiryMonth: 12,
              cardExpiryYear: 2026,
              processingFee: 11.43, // 3% processing fee
              netAmount: 369.45,
              description: 'Payment for reservation RES-001-2024',
              createdBy: 'system',
            },
          }),
          db.payment.create({
            data: {
              paymentNumber: 'PAY-002-2024',
              status: PaymentStatus.PENDING,
              method: PaymentMethod.BANK_TRANSFER,
              amount: 691.44,
              currency: 'USD',
              guestId: guests[1].id,
              reservationId: reservations[1].id,
              description: 'Corporate payment for reservation RES-002-2024',
              reference: 'CORP-INV-2024-001',
              createdBy: 'system',
            },
          }),
        ]);

        // Seed Ledger Entries
        console.log('📊 Seeding ledger entries...');
        const today = new Date();
        const businessDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        await db.ledgerEntry.create({
          data: {
            entryNumber: 'LE-001-2024',
            type: LedgerEntryType.REVENUE,
            amount: 360.0, // Room revenue without tax
            currency: 'USD',
            description: 'Room revenue - RES-001-2024',
            transactionDate: businessDate,
            businessDate,
            guestId: guests[0].id,
            reservationId: reservations[0].id,
            paymentId: payments[0].id,
            debitAccount: '1100', // Cash/Credit Card account
            creditAccount: '4100', // Room Revenue account
            reference: 'RES-001-2024',
            taxAmount: 20.88,
            taxRate: 0.0581,
            taxCode: 'ROOM',
            createdBy: 'system',
          },
        });

        await db.ledgerEntry.create({
          data: {
            entryNumber: 'LE-002-2024',
            type: LedgerEntryType.TAX,
            amount: 20.88,
            currency: 'USD',
            description: 'Tax on room revenue - RES-001-2024',
            transactionDate: businessDate,
            businessDate,
            guestId: guests[0].id,
            reservationId: reservations[0].id,
            paymentId: payments[0].id,
            debitAccount: '1100', // Cash account
            creditAccount: '2200', // Tax Payable account
            reference: 'RES-001-2024',
            taxAmount: 20.88,
            taxRate: 0.0581,
            taxCode: 'ROOM',
            createdBy: 'system',
          },
        });

        await db.ledgerEntry.create({
          data: {
            entryNumber: 'LE-003-2024',
            type: LedgerEntryType.FEE,
            amount: 11.43,
            currency: 'USD',
            description: 'Credit card processing fee - PAY-001-2024',
            transactionDate: businessDate,
            businessDate,
            paymentId: payments[0].id,
            debitAccount: '6100', // Processing Fee Expense
            creditAccount: '1100', // Cash account
            reference: 'PAY-001-2024',
            metadata: {
              processingRate: 0.03,
              processor: 'stripe',
            },
            createdBy: 'system',
          },
        });

        console.log('✅ Database seeding completed successfully!');
        console.log(`📊 Created:`);
        console.log(`   - ${guests.length} guests`);
        console.log(`   - ${rooms.length} rooms`);
        console.log(`   - ${ratePlans.length} rate plans`);
        console.log(`   - ${reservations.length} reservations`);
        console.log(`   - ${payments.length} payments`);
        console.log(`   - 3 ledger entries`);
      }
    );
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the seed function
seedDatabase()
  .then(() => {
    console.log('🌟 Seeding process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  });
