/**
 * Impostor Protocol - Game State Machine
 */

import { GAME_STATES, GameState, MEETING_SUBSTATES, MeetingSubstate } from '../../shared/constants';

export class GameStateMachine {
  public currentState: GameState = GAME_STATES.LOBBY;
  public currentMeetingSubstate: MeetingSubstate | null = null;
  public stateEnteredAt: number = Date.now();

  public transitionTo(newState: GameState): void {
    this.currentState = newState;
    this.stateEnteredAt = Date.now();
    if (newState !== GAME_STATES.MEETING) {
      this.currentMeetingSubstate = null;
    }
  }

  public transitionMeetingTo(substate: MeetingSubstate): void {
    this.currentState = GAME_STATES.MEETING;
    this.currentMeetingSubstate = substate;
    this.stateEnteredAt = Date.now();
  }

  public getElapsedMs(): number {
    return Date.now() - this.stateEnteredAt;
  }
}
