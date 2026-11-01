import { createLens } from './core/store';
import { install, uninstall } from './intercept';

const store = createLens();

/** The global LLM call recorder. `<LlmLens enabled>` installs it, or call `llmLens.install()`. */
export const llmLens = {
  ...store,
  /** Starts recording. Call it early (top of the entry file) or render `<LlmLens enabled>`. */
  install: () => install(store),
  uninstall,
};

export type LlmLensController = typeof llmLens;
