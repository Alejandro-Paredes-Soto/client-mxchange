// Adaptación para la versión OpenAPI del SDK de Conekta (v7+)
// Exportamos instancias de las APIs principales para usarlas desde los controladores.

// Adaptación para la versión OpenAPI del SDK de Conekta (v7+)
// Exportamos instancias de las APIs principales para usarlas desde los controladores.
let customers = null;
let orders = null;
let tokens = null;
let configured = false;

try {
  const { Configuration, CustomersApi, OrdersApi, TokensApi } = require('conekta');
  const apiKey = process.env.CONEKTA_API_KEY || process.env.CONECKTA_API_KEY || null;
  if (apiKey) {
    // El SDK generado usa configuration.accessToken para colocar el Bearer
    const config = new Configuration({ accessToken: apiKey });
    customers = new CustomersApi(config);
    orders = new OrdersApi(config);
    // TokensApi puede ser utilizado si se requiere crear tokens desde el servidor
    try {
      tokens = new TokensApi(config);
    } catch (ignore) {
      tokens = null;
    }
    configured = true;
  } else {
    console.warn('Conekta instalado pero no se encontró CONEKTA_API_KEY en .env. Endpoints de Conekta no estarán activos.');
  }
} catch (e) {
  console.warn('Conekta no está instalado o no pudo cargarse. Para habilitar pagos con Conekta ejecute: npm install conekta --save');
}

module.exports = { customers, orders, tokens, configured };
