/**
 * Punto de entrada histórico: el diagnóstico vive en `diagnose-env.ts` en la raíz del repo
 * porque `scripts/package.json` usa `"type": "module"` y con `tsx` eso rompe las exportaciones
 * nombradas al importar `lib/phase-protocol` desde aquí.
 *
 * Usa: `npm run diagnose` desde la raíz del proyecto.
 */
import "../diagnose-env"
