/**
 * Impostor Protocol - Meeting System & Gemini AI Bot Discussions
 * Leverages @google/genai (gemini-2.5-flash) to generate context-aware bot chat messages
 * based on actual bot roles, locations, task history, and observed suspects.
 */

import { GoogleGenAI } from '@google/genai';

export interface MeetingState {
  callerId: string;
  callerName: string;
  isBodyReport: boolean;
  reportedBodyColor?: string;
  bodyRoom?: string;
  votes: Map<string, string>; // voterId -> targetId | 'skip'
  remainingTime: number;
}

export interface BotMemoryContext {
  botName: string;
  botRole: 'crewmate' | 'impostor';
  currentRoom: string;
  completedTasks: string[];
  suspectName?: string;
  isCaller: boolean;
  meetingReason: 'body' | 'emergency';
  callerName: string;
  bodyRoom?: string;
  bodyColor?: string;
  alivePlayers: string[];
}

const DETERMINISTIC_ALIBIS: Record<string, string[]> = {
  crewmate: [
    'I was finishing my tasks in {room}.',
    'I was with the team near {room}, didn\'t see anything suspicious.',
    'Where was the body found exactly?',
    'I just came from {room}, everything looked clear there.',
    'I saw {other} running earlier, but not sure where.',
    'Let\'s be careful and skip if we don\'t have proof.',
  ],
  impostor: [
    'I was doing download tasks in {room} the whole time.',
    'I didn\'t see anyone in {room}. What happened?',
    'Has anyone seen {other}? They were acting kind of quiet.',
    'I think {other} was near {room} earlier.',
    'I can vouch that {room} was empty when I passed by.',
    'I say we skip unless someone saw it directly.',
  ],
  accusal: [
    'I literally saw {suspect} near the body!',
    'It\'s {suspect}! I caught them standing right there.',
    '{suspect} was chasing someone toward {room}!',
  ],
  caller_body: [
    'I found the body in {room}!',
    'Body in {room}! Who was nearby?',
    'Just reported a dead body in {room}.',
  ],
  caller_emergency: [
    'I called an emergency meeting because people are acting suspicious.',
    'We need to discuss before we lose more crewmates.',
  ],
};

function getRandomFallback(mem: BotMemoryContext): string {
  const other = mem.alivePlayers.find((p) => p !== mem.botName && p !== mem.suspectName) || 'someone';

  if (mem.isCaller) {
    if (mem.meetingReason === 'body') {
      const templates = DETERMINISTIC_ALIBIS.caller_body;
      const t = templates[Math.floor(Math.random() * templates.length)];
      return t.replace('{room}', mem.bodyRoom || mem.currentRoom);
    } else {
      const templates = DETERMINISTIC_ALIBIS.caller_emergency;
      return templates[Math.floor(Math.random() * templates.length)];
    }
  }

  if (mem.suspectName) {
    const templates = DETERMINISTIC_ALIBIS.accusal;
    const t = templates[Math.floor(Math.random() * templates.length)];
    return t.replace('{suspect}', mem.suspectName).replace('{room}', mem.currentRoom);
  }

  const pool = mem.botRole === 'impostor' ? DETERMINISTIC_ALIBIS.impostor : DETERMINISTIC_ALIBIS.crewmate;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen.replace('{room}', mem.currentRoom).replace('{other}', other);
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

/**
 * Generates an in-character 1-sentence chat message for an AI bot during an Emergency Meeting.
 */
export async function generateBotMeetingStatement(mem: BotMemoryContext): Promise<string> {
  const client = getGeminiClient();
  if (!client) {
    return getRandomFallback(mem);
  }

  const prompt = `You are simulated player "${mem.botName}" in a spaceship social deduction game (like Among Us).
Your role: ${mem.botRole.toUpperCase()}.
Meeting caller: ${mem.callerName} (${mem.meetingReason === 'body' ? 'Found dead body in ' + (mem.bodyRoom || 'corridor') : 'Emergency button'}).
Your location when meeting was called: ${mem.currentRoom}.
Your completed tasks: ${mem.completedTasks.length > 0 ? mem.completedTasks.join(', ') : 'none yet'}.
${mem.suspectName ? `You saw ${mem.suspectName} commit a murder or stand suspiciously over a corpse!` : ''}
Living players: ${mem.alivePlayers.join(', ')}.

Rules:
1. Write EXACTLY ONE short, natural, casual sentence for the meeting chat (max 15 words).
2. If you are an IMPOSTOR: NEVER confess or admit being the impostor. Give a convincing alibi in ${mem.currentRoom} or subtly cast suspicion on another player.
3. If you saw a suspect: Accuse them directly with urgency.
4. If you called the meeting: State why or where you found the body.
5. If you are a normal crewmate: Give your alibi or ask where the body was.
6. Return ONLY the spoken dialogue. Do NOT include quotes, bot labels, emojis, or markdown.`;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text?.trim();
    if (text && text.length > 2 && text.length < 140) {
      // Strip any accidental wrapping quotes
      return text.replace(/^["']|["']$/g, '');
    }
  } catch (err) {
    // Graceful fallback on network/quota error
  }

  return getRandomFallback(mem);
}
