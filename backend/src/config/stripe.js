// Configuración de Stripe para pagos
// Exporta la instancia de Stripe configurada con la API key

let stripe = null;
let configured = false;
let publicKey = null;

try {
  const Stripe = require('stripe');
  const secretKey = process.env.STRIPE_SECRET_KEY || null;
  publicKey = process.env.STRIPE_PUBLIC_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || null;
  
  if (secretKey) {
    stripe = Stripe(secretKey);
    configured = true;
    console.log('✓ Stripe configurado correctamente');
  } else {
    console.warn('⚠ Stripe instalado pero no se encontró STRIPE_SECRET_KEY en .env. Endpoints de Stripe no estarán activos.');
  }
} catch (e) {
  console.warn('⚠ Stripe no está instalado o no pudo cargarse. Para habilitar pagos con Stripe ejecute: npm install stripe --save');
}

module.exports = { stripe, configured, publicKey };
