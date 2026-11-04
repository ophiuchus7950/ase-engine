/**
 * Rivela ASE — runtime Slack settings routes (schema 003).
 *
 *   GET /v1/settings/slack  — current config (tokens ALWAYS masked on read)
 *   PUT /v1/settings/slack  — save bot/app tokens + channel + web url
 *
 * This lets the user supply their own Slack bot credentials from the Monitoring
 * UI instead of only via .env. Tokens are stored per-org in the local DB and are
 * NEVER returned in plaintext — only a `••••last4` preview + configured flags.
 * Empty-string fields on PUT clear that field.
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import { UpdateSlackSettingsBodySchema } from '../dto/schemas';
import { slackSettingsToWire, updateSlackSettingsToDomain } from '../dto/mappers';
import { requireUser } from '../middleware/session';

export function registerSlackSettingsRoutes(app: FastifyInstance, repos: Repos): void {
  app.get('/settings/slack', async (request) => {
    const user = requireUser(request);
    const settings = await repos.slackSettings.get(user.organizationId);
    if (settings === null) {
      // No row yet — return an unconfigured shape.
      return {
        organization_id: user.organizationId,
        configured: false,
        bot_token_masked: null,
        app_token_configured: false,
        signing_secret_configured: false,
        default_channel: '#ase-alerts',
        web_app_url: 'http://localhost:5173',
        updated_at: null,
      };
    }
    return slackSettingsToWire(settings);
  });

  app.put('/settings/slack', async (request) => {
    const user = requireUser(request);
    const body = UpdateSlackSettingsBodySchema.parse(request.body);
    const settings = await repos.slackSettings.upsert(
      user.organizationId,
      updateSlackSettingsToDomain(body),
      new Date(),
    );
    return slackSettingsToWire(settings);
  });
}
