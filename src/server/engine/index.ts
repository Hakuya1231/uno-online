export { reduce } from "./reduce";

export type { EngineAction, ReduceInput } from "./actions";
export type { ReduceResult } from "./reduce";

export {
  createStandardDeck,
  createDealerDrawPile,
  drawMany,
  drawTop,
  flipInitialNumberCard,
  peekTop,
  placeBottom,
  recycleDiscardPile,
  shuffle,
} from "./cards";

export {
  canPlayWildDrawFour,
  canStackPenalty,
  getActiveColor,
  isPlayable,
  scoreCard,
  scoreHand,
} from "./rules";
