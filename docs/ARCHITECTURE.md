# GolfIQ Technical Architecture

## Overview
GolfIQ is a full-stack TypeScript golf statistics tracking application built with Next.js 16, React 19, PostgreSQL, and Prisma ORM.

---

## Technology Stack

### Frontend
- **Framework:** Next.js 16.1.1 (App Router)
- **UI Library:** React 19.2.3
- **Language:** TypeScript 5.9.3
- **Styling:** Tailwind CSS 4.1.18
- **Charts:** Recharts 3.6.0
- **Forms:** react-select-async-paginate 0.7.11
- **Date Handling:** date-fns 4.1.0

### Backend
- **Runtime:** Node.js with Next.js API Routes
- **Database:** PostgreSQL
- **ORM:** Prisma 7.2.0 with @prisma/adapter-pg
- **Authentication:** NextAuth 4.24.13
- **Password Hashing:** bcryptjs 3.0.3
- **JWT:** jsonwebtoken 9.0.3

### External Services
- **Payments:** Stripe 20.1.1
- **File Upload:** UploadThing 7.7.4
- **AI:** OpenAI GPT-4o-mini (planned)
- **Ads:** Google AdSense (planned)
- **Golf Course Data:** https://golfcourseapi.com/

### Development Tools
- **Linting:** ESLint
- **CSS Processing:** PostCSS
- **TypeScript Execution:** tsx

---

## Project Structure

```
golfiq/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── auth/[...nextauth]/   # NextAuth endpoints
│   │   ├── users/                # User management
│   │   ├── rounds/               # Round CRUD
│   │   ├── courses/              # Course search
│   │   ├── tees/                 # Tee data
│   │   ├── dashboard/            # Stats calculation
│   │   ├── leaderboard/          # Leaderboard data
│   │   ├── friends/              # Friend management
│   │   ├── stripe/               # Stripe checkout/portal
│   │   ├── webhooks/             # Stripe webhooks
│   │   ├── uploadthing/          # File uploads
│   │   └── ai/                   # AI endpoints (planned)
│   ├── dashboard/                # Dashboard page
│   ├── rounds/                   # Round management
│   ├── courses/                  # Course browsing
│   ├── leaderboard/              # Leaderboards
│   ├── friends/                  # Social features
│   ├── profile/                  # User profile
│   ├── settings/                 # Settings
│   ├── pricing/                  # Pricing page
│   ├── login/                    # Auth pages
│   ├── admin/                    # Admin tools
│   ├── ai-coach/                 # AI features
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
│
├── components/                   # Reusable React components
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── Layout.tsx
│   ├── RoundCard.tsx
│   ├── CourseCard.tsx
│   ├── LeaderboardCard.tsx
│   ├── FriendCard.tsx
│   ├── UserStatsCard.tsx
│   ├── HoleCard.tsx
│   ├── PremiumGate.tsx
│   ├── SubscriptionBadge.tsx
│   └── ...
│
├── context/                      # React Context
│   ├── FriendsContext.tsx
│   └── AvatarContext.tsx
│
├── hooks/                        # Custom React hooks
│   └── useSubscription.ts
│
├── lib/                          # Utility functions
│   ├── auth.ts                   # Auth utilities
│   ├── auth-config.ts            # NextAuth config
│   ├── api-auth.ts               # API auth middleware
│   ├── db.ts                     # Prisma client
│   ├── stripe.ts                 # Stripe utilities
│   ├── subscription.ts           # Subscription helpers
│   ├── uploadthing.ts            # UploadThing config
│   ├── utils/
│   │   ├── handicap.ts           # Handicap calculation
│   │   └── leaderboard.ts        # Leaderboard stats
│   ├── achievements/             # Achievement system (planned)
│   │   ├── calculator.ts
│   │   ├── updater.ts
│   │   └── policy.ts
│   └── ai/                       # AI services (planned)
│       ├── client.ts
│       └── prompts.ts
│
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── migrations/               # Migration history
│   └── seed.ts                   # Seed data (planned)
│
├── docs/                         # Documentation
│   ├── ROADMAP.md
│   ├── SUBSCRIPTION_MODEL.md
│   ├── SUBSCRIPTION_SYSTEM.md
│   ├── STRIPE_SETUP.md
│   ├── AI_IMPLEMENTATION.md
│   ├── ACHIEVEMENTS.md
│   └── ARCHITECTURE.md (this file)
│
├── public/                       # Static assets
│
├── .env.local                    # Environment variables
├── next.config.js                # Next.js configuration
├── tailwind.config.js            # Tailwind configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json                  # Dependencies
```

---

## Database Schema

### Core Models

#### User & Authentication
```prisma
model User {
  id                BigInt   @id @default(autoincrement())
  email             String   @unique
  username          String   @unique
  passwordHash      String
  createdAt         DateTime @default(now())

  // Subscription
  subscriptionTier   SubscriptionTier   @default(free)
  subscriptionStatus SubscriptionStatus @default(active)
  stripeCustomerId   String?            @unique
  stripeSubscriptionId String?          @unique
  subscriptionExpiresAt DateTime?

  // Relations
  profile           UserProfile?
  rounds            Round[]
  friends           Friend[]
  friendRequests    FriendRequest[]
  leaderboardStats  UserLeaderboardStats?
  subscriptionEvents SubscriptionEvent[]
  lifetimeGrants    LifetimeGrant[]
}

model UserProfile {
  id               BigInt   @id @default(autoincrement())
  userId           BigInt   @unique
  firstName        String?
  lastName         String?
  bio              String?
  avatar           String?
  gender           Gender?
  defaultTee       DefaultTee?
  favoriteCourseId BigInt?
  dashboardVisibility DashboardVisibility @default(private)

  user User @relation(fields: [userId], references: [id])
}
```

#### Course & Tee Data
```prisma
model Course {
  id          BigInt   @id @default(autoincrement())
  clubName    String
  courseName  String
  locationId  BigInt?

  location Location? @relation(fields: [locationId], references: [id])
  tees     Tee[]
  rounds   Round[]
}

model Location {
  id        BigInt  @id @default(autoincrement())
  address   String?
  city      String?
  state     String?
  country   String?
  latitude  Float?
  longitude Float?

  courses Course[]
}

model Tee {
  id            BigInt  @id @default(autoincrement())
  courseId      BigInt
  teeName       String
  gender        TeeGender?
  courseRating  Float?
  slopeRating   Int?
  yardage       Int?
  par           Int?

  course Course @relation(fields: [courseId], references: [id])
  holes  Hole[]
  rounds Round[]
}

model Hole {
  id          BigInt @id @default(autoincrement())
  teeId       BigInt
  holeNumber  Int
  par         Int?
  yardage     Int?
  handicap    Int?

  tee Tee @relation(fields: [teeId], references: [id])
}
```

#### Rounds & Scoring
```prisma
model Round {
  id                    BigInt   @id @default(autoincrement())
  userId                BigInt
  courseId              BigInt
  teeId                 BigInt
  date                  DateTime
  score                 Int
  par                   Int
  advancedStatsTracked  Boolean  @default(false)
  fir                   Int?
  totalFirOpportunities Int?
  gir                   Int?
  totalGir              Int?
  putts                 Int?
  penalties             Int      @default(0)
  notes                 String?
  createdAt             DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id])
  course Course @relation(fields: [courseId], references: [id])
  tee    Tee    @relation(fields: [teeId], references: [id])
  holes  RoundHole[]
}

model RoundHole {
  id         BigInt @id @default(autoincrement())
  roundId    BigInt
  holeNumber Int
  score      Int
  par        Int
  fir        Boolean?
  gir        Boolean?
  putts      Int?
  penalties  Int?

  round Round @relation(fields: [roundId], references: [id], onDelete: Cascade)
}
```

#### Social Features
```prisma
model Friend {
  id        BigInt   @id @default(autoincrement())
  userId1   BigInt
  userId2   BigInt
  createdAt DateTime @default(now())

  user1 User @relation("UserFriends", fields: [userId1], references: [id])
  user2 User @relation("UserFriends", fields: [userId2], references: [id])

  @@unique([userId1, userId2])
}

model FriendRequest {
  id          BigInt   @id @default(autoincrement())
  requesterId BigInt
  recipientId BigInt
  createdAt   DateTime @default(now())

  requester User @relation("SentRequests", fields: [requesterId], references: [id])
  recipient User @relation("ReceivedRequests", fields: [recipientId], references: [id])

  @@unique([requesterId, recipientId])
}
```

#### Leaderboard
```prisma
model UserLeaderboardStats {
  id            BigInt  @id @default(autoincrement())
  userId        BigInt  @unique
  handicap      Float?
  averageScore  Float?
  bestScore     Int?
  totalRounds   Int     @default(0)
  lastUpdated   DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([handicap])
  @@index([averageScore])
}
```

#### Subscription
```prisma
model SubscriptionEvent {
  id          BigInt              @id @default(autoincrement())
  userId      BigInt
  eventType   String
  tier        SubscriptionTier?
  status      SubscriptionStatus?
  stripeEventId String?
  createdAt   DateTime            @default(now())

  user User @relation(fields: [userId], references: [id])
}

model LifetimeGrant {
  id          BigInt   @id @default(autoincrement())
  userId      BigInt
  grantedBy   String
  reason      String?
  grantedAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

### Enums
```prisma
enum SubscriptionTier {
  free
  premium
  lifetime
}

enum SubscriptionStatus {
  active
  cancelled
  past_due
}

enum Gender {
  male
  female
  unspecified
}

enum DefaultTee {
  blue
  white
  red
  gold
  black
}

enum TeeGender {
  male
  female
}

enum DashboardVisibility {
  private
  friends
  public
}
```

---

## Authentication Flow

### Session Management
```typescript
// NextAuth configuration
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!valid) return null;

        return {
          id: user.id.toString(),
          email: user.email,
          username: user.username,
        };
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      return session;
    },
  },
};
```

### API Route Protection
```typescript
// lib/api-auth.ts
export async function requireAuth(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(session.user.id) },
    include: { profile: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

export async function requirePremium(req: Request) {
  const user = await requireAuth(req);

  if (!isPremiumUser(user)) {
    throw new Error('Premium subscription required');
  }

  return user;
}
```

---

## Key Algorithms

### Handicap Calculation (USGA Method)
```typescript
// lib/utils/handicap.ts

export function calculateHandicap(rounds: Round[]): number | null {
  if (rounds.length === 0) return null;

  // Sort by date (most recent first)
  const sortedRounds = rounds.sort((a, b) =>
    b.date.getTime() - a.date.getTime()
  );

  // Take last 20 rounds
  const last20 = sortedRounds.slice(0, 20);

  // Calculate differentials
  const differentials = last20.map(round => {
    const courseRating = round.tee.courseRating;
    const slopeRating = round.tee.slopeRating;

    return ((round.score - courseRating) * 113) / slopeRating;
  });

  // Best 8 of last 20 (or adjusted for <20 rounds)
  const count = getCountForHandicap(differentials.length);
  const bestDifferentials = differentials
    .sort((a, b) => a - b)
    .slice(0, count);

  const average = bestDifferentials.reduce((sum, d) => sum + d, 0) / count;

  return Math.round(average * 10) / 10; // Round to 1 decimal
}

function getCountForHandicap(totalRounds: number): number {
  if (totalRounds <= 5) return 1;
  if (totalRounds === 6) return 2;
  if (totalRounds <= 8) return 3;
  if (totalRounds <= 11) return 4;
  if (totalRounds <= 13) return 5;
  if (totalRounds <= 15) return 6;
  if (totalRounds <= 17) return 7;
  return 8; // 18-20 rounds
}
```

### Dashboard Stats Aggregation
```typescript
// app/api/dashboard/route.ts

export async function GET(req: Request) {
  const user = await requireAuth(req);
  const { mode, dateFilter } = getQueryParams(req);

  // Build date filter
  const dateWhere = buildDateFilter(dateFilter);

  // Get rounds
  const rounds = await prisma.round.findMany({
    where: {
      userId: user.id,
      ...dateWhere,
    },
    include: { tee: true, holes: true },
    orderBy: { date: 'desc' },
  });

  // Normalize 9-hole rounds if mode is 'combined'
  const normalizedRounds = mode === 'combined'
    ? normalizeRounds(rounds)
    : rounds;

  // Calculate stats
  const stats = {
    handicap: calculateHandicap(normalizedRounds),
    averageScore: average(normalizedRounds.map(r => r.score)),
    bestScore: Math.min(...normalizedRounds.map(r => r.score)),
    worstScore: Math.max(...normalizedRounds.map(r => r.score)),
    totalRounds: normalizedRounds.length,
    par3Avg: calculateParAverage(normalizedRounds, 3),
    par4Avg: calculateParAverage(normalizedRounds, 4),
    par5Avg: calculateParAverage(normalizedRounds, 5),
    // Advanced stats
    firPercent: calculateAdvancedStat(normalizedRounds, 'fir'),
    girPercent: calculateAdvancedStat(normalizedRounds, 'gir'),
    avgPutts: average(normalizedRounds.map(r => r.putts).filter(Boolean)),
    avgPenalties: average(normalizedRounds.map(r => r.penalties)),
  };

  return Response.json(stats);
}
```

---

## Subscription Management

### Stripe Integration
```typescript
// lib/stripe.ts

export async function createCheckoutSession(userId: bigint, priceId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const session = await stripe.checkout.sessions.create({
    customer: user.stripeCustomerId || undefined,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/subscription/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
    metadata: { userId: userId.toString() },
  });

  return session;
}

export async function handleWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await updateSubscription(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await cancelSubscription(event.data.object);
      break;
  }
}
```

---

## Performance Optimizations

### Caching Strategy
```typescript
// Dashboard stats cached for 5 minutes
// Leaderboard cached for 10 minutes
// Course details cached for 1 hour
// AI insights cached for 24 hours

// Example: React Query caching
const { data: stats } = useQuery({
  queryKey: ['dashboard', userId, mode, dateFilter],
  queryFn: fetchDashboardStats,
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

### Database Indexes
```prisma
// Critical indexes for performance

@@index([userId, date])        // Round queries
@@index([courseId])             // Course lookups
@@index([handicap])             // Leaderboard sorting
@@index([userId, isRead])       // Notifications
```

### Pagination
```typescript
// Courses: Infinite scroll with 20 per page
// Leaderboard: Top 100 for free, unlimited for premium
// Rounds: Load all (typically <200 per user)
```

---

## Security Considerations

### Input Validation
```typescript
// Zod schemas for all API inputs
import { z } from 'zod';

const roundSchema = z.object({
  courseId: z.string(),
  teeId: z.string(),
  date: z.string().datetime(),
  score: z.number().int().min(18).max(200),
  penalties: z.number().int().min(0).max(50),
  // ...
});
```

### SQL Injection Prevention
- Prisma ORM parameterizes all queries automatically
- No raw SQL queries used in application

### XSS Prevention
- React escapes output by default
- Sanitize user-generated content (bio, notes)

### Authentication
- Password hashing with bcryptjs (10 rounds)
- JWT tokens with 30-day expiration
- Secure session cookies (httpOnly, secure, sameSite)

---

## Deployment Architecture

### Hosting (Recommended)
- **Frontend + API:** Vercel
- **Database:** Supabase PostgreSQL or Vercel Postgres
- **File Storage:** UploadThing
- **CDN:** Vercel Edge Network

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://...

# NextAuth
NEXTAUTH_URL=https://golfiq.app
NEXTAUTH_SECRET=...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...

# OpenAI (future)
OPENAI_API_KEY=sk-...

# UploadThing
UPLOADTHING_SECRET=...
UPLOADTHING_APP_ID=...
```

---

## Monitoring & Logging

### Error Tracking (Planned)
- Sentry for error monitoring
- Log critical errors to external service

### Analytics (Planned)
- Google Analytics for user behavior
- Mixpanel for feature usage tracking
- Stripe Dashboard for revenue metrics

### Performance Monitoring
- Vercel Analytics for Core Web Vitals
- Database query performance via Prisma logging

---

## Testing Strategy (Future)

### Unit Tests
- Utils (handicap calculation, stats aggregation)
- API route handlers
- React components (Jest + React Testing Library)

### Integration Tests
- API endpoint flows
- Database operations
- Authentication flows

### E2E Tests (Playwright)
- User registration and login
- Round creation and editing
- Subscription upgrade flow
- Achievement unlocking

---

## Future Architecture Considerations

### Scalability
- Redis caching layer for hot data
- Read replicas for database
- CDN for static assets
- Background jobs for heavy computations (AI, stats)

### Features
- Real-time notifications (WebSockets or Server-Sent Events)
- Mobile apps (React Native or PWA)
- Public API for third-party integrations
- Multi-language support (i18n)

---

## Development Workflow

### Local Setup
```bash
# Install dependencies
npm install

# Set up database
npx prisma migrate dev

# Seed data (optional)
npx prisma db seed

# Run development server
npm run dev
```

### Code Style
- ESLint for linting
- Prettier for formatting (recommended)
- TypeScript strict mode enabled
- Conventional Commits for git messages

---

## API Rate Limiting (Future)

```typescript
// Rate limits per user per endpoint
const RATE_LIMITS = {
  '/api/rounds': '100/hour',
  '/api/ai/chat': '20/month', // Premium only
  '/api/courses': '1000/hour',
  '/api/leaderboard': '100/hour',
};
```

---

## Conclusion

GolfIQ's architecture is designed for:
- **Scalability:** Handle thousands of concurrent users
- **Performance:** Fast page loads and API responses
- **Security:** Industry-standard auth and data protection
- **Maintainability:** Clean code structure with TypeScript
- **Extensibility:** Easy to add new features (AI, achievements, etc.)
