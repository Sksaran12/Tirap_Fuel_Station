/**
 * Browser-facing alias for the authoritative calculation engine.
 *
 * The formulas live in `backend/src/utils/calculator.js` so the API owns the
 * business logic. The UI imports this alias only to render a live preview;
 * every persisted figure is recalculated by the server inside a transaction.
 */
export * from '../backend/src/utils/calculator.js'
