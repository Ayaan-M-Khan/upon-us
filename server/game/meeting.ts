/**
 * Impostor Protocol - Meeting System
 */

export interface MeetingState {
  callerId: string;
  callerName: string;
  isBodyReport: boolean;
  reportedBodyColor?: string;
  votes: Map<string, string>; // voterId -> targetId | 'skip'
  remainingTime: number;
}
