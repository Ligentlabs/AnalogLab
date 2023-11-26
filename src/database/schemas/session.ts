/* eslint-disable sort-keys-fix/sort-keys-fix  */
import { z } from 'zod';

import { LobeMetaDataSchema } from '@/types/meta';

export const DB_SessionSchema = z.object({
  type: z.enum(['agent', 'group']).default('agent'),
  meta: LobeMetaDataSchema,
  group: z.string().default('default'),

  // TODO: Need to check whether use a strict format schema
  config: z.any(),
});
/* eslint-enable  */

export type DB_Session = z.infer<typeof DB_SessionSchema>;
