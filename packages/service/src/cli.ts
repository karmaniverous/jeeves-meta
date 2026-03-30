/**
 * Commander CLI for jeeves-meta service.
 *
 * Uses `createServiceCli` from the core SDK for standard commands
 * (start, status, config, init, service). Custom domain-specific
 * commands are registered via `descriptor.customCliCommands`.
 *
 * @module cli
 */

import { createServiceCli } from '@karmaniverous/jeeves';

import { metaDescriptor } from './descriptor.js';

createServiceCli(metaDescriptor).parse();
