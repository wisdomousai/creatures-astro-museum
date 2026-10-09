import type { AstroIntegration } from 'astro';
import type { Options } from './src/types';

export type { Config, Crew, Options, Wing } from './src/types';

/** Your content, as a museum to walk round, with the crew wandering its halls. */
export default function museum(options?: Options): AstroIntegration;
