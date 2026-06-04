/**
 * config.ts
 * Configuración del servidor cargada desde variables de entorno.
 * Se valida con Zod al arrancar; si falta algo, el proceso aborta con un
 * mensaje claro antes de procesar cualquier mensaje.
 */
import { z } from 'zod'
import 'dotenv/config'

const ConfigSchema = z.object({
  PORT:     z.coerce.number().default(3100),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ── Onchain ──────────────────────────────────────────────────────────────
  /** RPC de Arbitrum Sepolia */
  RPC_URL: z.string().url().default(
    'https://lb.drpc.live/arbitrum-sepolia/AuajrTfUKUDcljFTxiXAxPOrBZbcQJQR8Jr2uuQ63qxe',
  ),
  /** Dirección del proxy UUPS de ArbitrumSettlementCore */
  CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).default(
    '0xAaE3116210b866f00ccf8dCbD540A6Cc5d070d72',
  ),
  /** Tokens ERC-20 permitidos (separados por coma) */
  ALLOWED_TOKENS: z.string().default(
    '0xA730eFe70d3f67d08dD4a17a867c95bFe1F33CfA,0xC7f974b3710560D070dEc95288339EfAB683C417',
  ),

  // ── Relayer ───────────────────────────────────────────────────────────────
  /** Clave privada del wallet relayer (debe tener RELAYER_ROLE) */
  RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Debe ser hex de 32 bytes'),

  // ── Gas ───────────────────────────────────────────────────────────────────
  /** Techo de gas por transacción (unidades). Por defecto 500k */
  GAS_LIMIT: z.coerce.number().default(500_000),

  // ── ISO 8583 ──────────────────────────────────────────────────────────────
  /** Duración del hold en segundos desde la autorización */
  HOLD_TTL_SECONDS: z.coerce.number().default(3_600),

  // ── Base de datos ─────────────────────────────────────────────────────────
  DB_PATH: z.string().default('./data/middleware.db'),

  // ── Mapeos de direcciones ─────────────────────────────────────────────────
  /** JSON: { "<token de tarjeta>": "<0xDirección>" } */
  CARD_MAPPING_FILE:     z.string().default('./data/card-mapping.json'),
  /** JSON: { "<referencia de comercio>": "<0xDirección>" } */
  MERCHANT_MAPPING_FILE: z.string().default('./data/merchant-mapping.json'),
})

export type Config = z.infer<typeof ConfigSchema>

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid configuration:\n${issues}`)
  }
  return result.data
}

export const config: Config = loadConfig()

export function allowedTokens(): string[] {
  return config.ALLOWED_TOKENS.split(',').map((t) => t.trim())
}
