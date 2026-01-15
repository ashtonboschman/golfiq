# GolfIQ AI Coach Implementation Guide

## Overview
GolfIQ's AI Coach provides personalized golf insights using OpenAI's GPT-4o-mini model to analyze user performance data and deliver actionable coaching recommendations.

---

## AI Strategy & Positioning

### Core Differentiator
**"AI-powered personal golf coach focused on WHY scores happen, not GPS distances"**

Unlike GPS-based golf apps (Arccos, Shot Scope, Garmin), GolfIQ extracts deep insights from user-entered statistics without requiring expensive hardware or real-time GPS tracking.

### Value Propositions
1. **Post-Round Intelligence:** Automatic analysis after every round
2. **Weakness Identification:** Data-driven improvement priorities
3. **Predictive Insights:** Score forecasting and trend analysis
4. **Conversational Coaching:** Natural language Q&A about your game
5. **Course Matchup Analysis:** Know which courses suit your game

---

## Technology Stack

### Model Selection
**OpenAI GPT-4o-mini**
- **Cost:** $0.150 per 1M input tokens, $0.600 per 1M output tokens
- **Speed:** Fast response times (<2 seconds)
- **Quality:** Excellent at structured data analysis and actionable insights
- **Context window:** 128k tokens

### Cost Estimates
| Feature | Tokens per Request | Cost per Request | Monthly Cost (1000 premium users) |
|---------|-------------------|------------------|-----------------------------------|
| Post-round recap | ~500 | $0.0005 | $2 (4 rounds/user) |
| Dashboard insights | ~800 | $0.0008 | $0.80 (1x/user) |
| AI chat message | ~1000 | $0.001 | $10 (10 messages/user) |
| Course matchup | ~600 | $0.0006 | $2.40 (4 courses/user) |
| **Total** | | | **~$15-20/month** |

**Revenue vs Cost:** $4,990/month revenue - $20 AI costs = **99.6% margin**

---

## Phase 1: MVP AI Features (Launch)

### 1. Post-Round AI Recap ⭐ Highest Impact

**Trigger:** Automatically after round save

**Input Data:**
```typescript
{
  // User profile
  handicap: number,
  avgScore: number,
  avgFIR: number,
  avgGIR: number,
  avgPutts: number,
  avgPenalties: number,

  // Current round
  course: string,
  score: number,
  toPar: number,
  fir: number,
  firPercent: number,
  gir: number,
  girPercent: number,
  putts: number,
  penalties: number,

  // Hole breakdown (if available)
  holes: Array<{
    number: number,
    par: number,
    score: number,
    putts?: number,
  }>
}
```

**Output Format:**
```
🎯 Round Recap - Pine Ridge Golf Club

Strengths This Round:
• Excellent driving accuracy (10/14 FIR, 71% vs your 45% avg)
• Solid par 3 scoring (3 pars, avg 3.0 vs 3.4 overall)

Areas for Improvement:
• Putting struggled today (34 putts vs 30 avg, +4)
• Par 5 scoring (avg 6.3 vs 5.8 overall, cost you ~2 strokes)

Bottom Line:
Your 88 was 4 over your average. Eliminating those 4 extra putts
would have put you at 84 - your best round this year.

Focus for next round: Green reading and lag putting
```

**Implementation:**
- Store in `AiInsight` table
- Display on round card
- Show in round history
- Premium only

---

### 2. Dashboard AI Summary Widget

**Trigger:** Dashboard page load (cached 24 hours)

**Input Data:**
```typescript
{
  // User stats from last 20 rounds (free) or all rounds (premium)
  handicap: number,
  totalRounds: number,
  avgScore: number,
  avgFIR: number,
  avgGIR: number,
  avgPutts: number,
  avgPenalties: number,

  // Trends
  firTrend: 'improving' | 'declining' | 'stable',
  girTrend: 'improving' | 'declining' | 'stable',
  scoreTrend: 'improving' | 'declining' | 'stable',
}
```

**Output Format:**
```
💡 AI Insights (Last 20 Rounds)

Your Biggest Opportunity:
Fairways in Regulation (38% FIR)
↳ If you improved to 50% FIR, you'd save ~2.1 strokes per round

Your Strength:
Par 3 Scoring (avg 3.2 vs field avg 3.6)

Trend Alert:
📈 Putting improving: 31.2 avg putts (down from 33.1 last month)
```

**Implementation:**
- Calculate on dashboard load
- Cache for 24 hours
- Premium only widget
- Positioned prominently on dashboard

---

### 3. Basic AI Chat Interface

**Trigger:** User navigates to AI Coach page

**Features:**
- Pre-loaded quick questions
- Natural language input
- Conversational context
- Rate limited (20 messages/month for premium)

**Pre-loaded Prompts:**
```
[What's holding my score back?]
[How can I break 90?]
[What should I focus on?]
[How do I compare at this course?]
[Why did I play poorly today?]
[How is my putting trending?]
```

**Example Conversation:**
```
User: "What's holding my score back?"

AI: Based on your last 20 rounds, here are your biggest scoring leaks:

1. **Fairways (38% FIR)** - Your biggest opportunity
   • You're missing 62% of fairways, forcing difficult approach shots
   • Improving to 50% FIR would save you ~2.1 strokes per round
   • Focus: Accuracy over distance off the tee

2. **Penalties (1.8 per round)** - Costing you ~1.6 strokes
   • You take 1.8 penalties per round vs your handicap expectation of 0.8
   • Focus: Course management and playing within your limits

3. **Putting (32 putts avg)** - Room for improvement
   • 2 putts above tour average for your handicap
   • Focus: Lag putting and distance control

If you focused on keeping it in play off the tee and eliminating
penalties, you'd likely drop your average by 3-4 strokes.
```

**Implementation:**
- Chat UI with message history
- Store in `AiChatMessage` table
- Track usage in `AiUsageQuota` table
- Premium only
- Context includes user stats + recent rounds

---

## Phase 2: Advanced AI Features (Post-Launch)

### 4. Course Matchup Analysis

**Trigger:** User views course details page (if they've played it before)

**Output:**
```
🎯 Course Matchup for Pine Ridge

This course favors your game: +1.2 vs your average

Why it suits you:
• Tight fairways reward your accuracy (62% FIR here vs 45% avg)
• Shorter par 4s play to your strengths (avg 4.8 vs 5.2 overall)

Watch out for:
• Long par 3s (3 holes over 180 yards, you avg 3.6 on these)
• Water on holes 7, 12, 15 - you average +0.8 with penalties

Historical Performance:
• 3 rounds played, avg score 87 (vs 91 overall avg)
• Best: 83 (June 2025), Worst: 89 (April 2025)
```

---

### 5. Pre-Round Briefing

**Trigger:** User selects course on "Add Round" page (if played before)

**Output:**
```
📋 Pre-Round Strategy - Pine Ridge

Based on your last 3 rounds here:

Focus Areas:
• Keep driver in play on holes 4, 9, 14 (your bogey+ rate: 73%)
• Commit to clubs on par 3s (averaging 3.6 vs 3.2 overall)

Your Advantage Holes:
• Par 5s (you're -0.3 vs your handicap here)
• Holes 2, 6, 11 (birdie rate 40%)

Predicted Score Range: 85-91 (87 most likely)

Weather Conditions: Moderate wind (12mph SW)
Impact: You score ~2 worse in wind. Keep it low and use more club.
```

---

### 6. Handicap Trajectory & Forecasting

**Trigger:** Dashboard or dedicated "Progress" page

**Output:**
```
📊 Handicap Forecast

Current: 12.4
30-day projection: 11.8 ± 0.6
90-day projection: 11.1 ± 0.9

Why you're improving:
• FIR up 8% (38% → 46%) over last month
• Penalties down 0.6 per round
• Putting steady at 31.2

To reach single digits by June:
1. Maintain driving accuracy trend (target 50% FIR)
2. Improve approach play (GIR to 55%+)
3. Focus on scrambling when missing greens

Confidence: 78% (based on 47 rounds of data)
```

---

### 7. ROI Analysis Dashboard

**Trigger:** Premium users on "Insights" page

**Output:**
```
💰 Score Impact Analysis

Where to practice for biggest improvement:

1. Fairways (38% → 50%) = -2.1 strokes/round
   • Estimated time to achieve: 8-12 rounds with focus

2. Penalties (1.8 → 1.0) = -1.6 strokes/round
   • Quick win through better course management

3. Putting (32 → 30) = -1.2 strokes/round
   • Focus on lag putting and distance control

4. GIR (42% → 50%) = -0.9 strokes/round
   • Requires improved approach shot accuracy

Total potential improvement: -5.8 strokes per round
Your projected average with all improvements: 85.2 (from 91)
```

---

## Database Schema

```prisma
// AI-related tables

model AiInsight {
  id          BigInt   @id @default(autoincrement())
  userId      BigInt
  roundId     BigInt?  // null for dashboard-level insights
  courseId    BigInt?
  insightType String   // 'post_round', 'dashboard_summary', 'course_matchup', etc
  content     Json     // structured insight data
  generatedAt DateTime @default(now())

  user  User   @relation(fields: [userId], references: [id])
  round Round? @relation(fields: [roundId], references: [id])

  @@index([userId, insightType])
  @@index([roundId])
}

model AiChatMessage {
  id        BigInt   @id @default(autoincrement())
  userId    BigInt
  role      String   // 'user' or 'assistant'
  content   String   @db.Text
  context   Json?    // stats snapshot used for this message
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
}

model AiUsageQuota {
  id              BigInt   @id @default(autoincrement())
  userId          BigInt   @unique
  chatMessagesUsed Int     @default(0)
  lastResetAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

---

## API Endpoints

```typescript
// POST /api/ai/round-recap
// Generates post-round AI analysis
// Triggered automatically after round save
// Premium only

// GET /api/ai/dashboard-summary
// Generates dashboard AI insights
// Cached for 24 hours
// Premium only

// POST /api/ai/chat
// Conversational AI coach
// Rate limited: 20 messages/month
// Premium only
// Body: { message: string, conversationId?: string }

// GET /api/ai/course-matchup/:courseId
// Course-specific performance analysis
// Premium only

// POST /api/ai/pre-round-brief
// Pre-round strategy briefing
// Premium only
// Body: { courseId: string, teeId?: string }

// GET /api/ai/usage
// Get current AI usage quota
// Returns: { chatMessagesUsed, chatMessagesLimit, resetDate }
```

---

## Prompt Engineering

### Post-Round Recap Prompt Template

```typescript
const SYSTEM_PROMPT = `You are a professional golf coach analyzing a round for your student.
Be specific with numbers, calculate stroke impact, and provide actionable advice.
Keep responses brief (150 words max) and encouraging but honest.`;

const USER_PROMPT = `
STUDENT PROFILE:
- Handicap: ${user.handicap}
- Average Score: ${stats.avgScore}
- Typical FIR: ${stats.avgFIR}%
- Typical GIR: ${stats.avgGIR}%
- Typical Putts: ${stats.avgPutts}

TODAY'S ROUND:
- Course: ${round.courseName}
- Score: ${round.score} (${round.toPar > 0 ? '+' : ''}${round.toPar})
- FIR: ${round.fir}/${round.totalFIROpportunities} (${round.firPercent}%)
- GIR: ${round.gir}/${round.totalHoles} (${round.girPercent}%)
- Putts: ${round.putts}
- Penalties: ${round.penalties}

Generate a brief recap in this JSON format:
{
  "strengths": ["strength 1 with specific numbers", "strength 2"],
  "weaknesses": ["weakness 1 with stroke impact", "weakness 2"],
  "bottomLine": "one sentence summary with score impact calculation",
  "nextRoundFocus": "specific actionable tip"
}
`;
```

### Dashboard Summary Prompt Template

```typescript
const SYSTEM_PROMPT = `You are a golf performance analyst identifying the highest-impact
improvement opportunities. Use data to quantify stroke savings. Be concise and actionable.`;

const USER_PROMPT = `
PLAYER STATS (Last ${rounds.length} rounds):
- Handicap: ${stats.handicap}
- Average Score: ${stats.avgScore}
- FIR: ${stats.avgFIR}%
- GIR: ${stats.avgGIR}%
- Average Putts: ${stats.avgPutts}
- Average Penalties: ${stats.avgPenalties}

TRENDS:
- FIR trend: ${trends.fir} (${trends.firChange}% change)
- GIR trend: ${trends.gir} (${trends.girChange}% change)
- Score trend: ${trends.score} (${trends.scoreChange} change)

Identify:
1. Biggest improvement opportunity with estimated stroke savings
2. Current strength to maintain
3. Most notable trend (improving or declining)

Return JSON:
{
  "biggestOpportunity": {
    "area": "FIR",
    "currentStat": "38%",
    "targetStat": "50%",
    "strokeSavings": 2.1,
    "reasoning": "brief explanation"
  },
  "strength": "Par 3 scoring (3.2 avg vs field avg 3.6)",
  "trendAlert": {
    "metric": "Putting",
    "direction": "improving",
    "message": "31.2 avg putts (down from 33.1 last month)"
  }
}
`;
```

### AI Chat Prompt Template

```typescript
const SYSTEM_PROMPT = `You are an expert golf coach with access to your student's complete
performance data. Provide specific, data-driven insights with actionable recommendations.
Reference actual stats and calculate stroke impact. Be conversational but professional.`;

const CONTEXT_PROMPT = `
YOUR STUDENT'S PROFILE:
- Name: ${user.name}
- Handicap: ${stats.handicap}
- Total Rounds: ${stats.totalRounds}
- Average Score: ${stats.avgScore}
- Best Score: ${stats.bestScore}

RECENT PERFORMANCE (Last 20 rounds):
- FIR: ${stats.avgFIR}% (trend: ${trends.fir})
- GIR: ${stats.avgGIR}% (trend: ${trends.gir})
- Putts: ${stats.avgPutts} (trend: ${trends.putts})
- Penalties: ${stats.avgPenalties}

STRENGTHS: ${strengths.join(', ')}
WEAKNESSES: ${weaknesses.join(', ')}

Answer the student's question using this data. Calculate stroke impact where relevant.
`;
```

---

## Rate Limiting & Quotas

### Premium Tier Limits
```typescript
const AI_LIMITS = {
  postRoundRecap: Infinity, // Automatic, unlimited
  dashboardSummary: Infinity, // Cached 24hr, effectively unlimited
  chatMessages: 20, // Per month
  courseMatchups: Infinity, // Cached per course
  preRoundBriefs: Infinity, // Unlimited
};

const CACHE_DURATIONS = {
  dashboardSummary: 24 * 60 * 60 * 1000, // 24 hours
  courseMatchup: 7 * 24 * 60 * 60 * 1000, // 7 days
};
```

### Usage Tracking
```typescript
export async function trackAIUsage(userId: bigint, feature: string) {
  if (feature === 'chat') {
    const quota = await prisma.aiUsageQuota.findUnique({
      where: { userId }
    });

    // Reset monthly on lastResetAt
    const now = new Date();
    const monthAgo = new Date(quota.lastResetAt);
    monthAgo.setMonth(monthAgo.getMonth() + 1);

    if (now > monthAgo) {
      // Reset quota
      await prisma.aiUsageQuota.update({
        where: { userId },
        data: { chatMessagesUsed: 1, lastResetAt: now },
      });
    } else {
      // Increment usage
      if (quota.chatMessagesUsed >= 20) {
        throw new Error('Monthly AI chat limit reached');
      }
      await prisma.aiUsageQuota.update({
        where: { userId },
        data: { chatMessagesUsed: quota.chatMessagesUsed + 1 },
      });
    }
  }
}
```

---

## Implementation Checklist

### Phase 1: MVP (Week 3-4)
- [ ] Set up OpenAI account and API key
- [ ] Add environment variables
- [ ] Create AI service wrapper (`lib/ai/client.ts`)
- [ ] Add database schema for `AiInsight`, `AiChatMessage`, `AiUsageQuota`
- [ ] Implement post-round recap prompt and endpoint
- [ ] Integrate recap trigger on round save
- [ ] Build dashboard AI widget with caching
- [ ] Create AI chat interface page
- [ ] Implement chat rate limiting
- [ ] Add premium gates to all AI features

### Phase 2: Advanced (Post-Launch)
- [ ] Course matchup analysis
- [ ] Pre-round briefings
- [ ] Handicap forecasting
- [ ] ROI analysis dashboard

---

## Success Metrics

### Engagement (Month 1)
- **60%+ of premium users** use AI coach
- **Average 8 chat messages** per premium user per month
- **Post-round recap viewed** on 80%+ of rounds

### Conversion
- **AI coach** drives 30%+ of free-to-premium conversions
- **"Unlock AI insights"** CTA has 15%+ click-through rate

### Retention
- **Premium users with AI engagement** have 2x retention vs those without

---

## Future Enhancements

### V2 Features
- **Voice input** for chat messages
- **Image analysis** (swing videos, course photos)
- **Comparative analysis** (vs friends, vs pros)
- **Practice plan generator** (weekly focus areas)
- **Mental game coaching** (confidence, course management)

### V3 Features
- **Strokes gained** modeling (Tour-caliber analytics without GPS)
- **Club-by-club** performance (when data available)
- **Weather impact** analysis
- **Playing partner** performance correlation
- **Tournament preparation** mode

---

## Monitoring & Optimization

### Key Metrics to Track
- AI API costs per user per month
- Average response time
- Error rates
- User satisfaction (thumbs up/down on AI responses)
- Feature usage breakdown

### Cost Optimization
- Cache aggressively (24hr+ for dashboard insights)
- Use streaming responses for chat (better UX)
- Batch non-urgent analyses (nightly jobs)
- Monitor token usage and optimize prompts
