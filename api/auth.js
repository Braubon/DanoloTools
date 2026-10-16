// Función de Vercel: /api/auth/ — la lógica está en tools/fabula-ultima-fichas/servidor/web.js
import { auth } from '../tools/fabula-ultima-fichas/servidor/web.js';

export default { fetch: auth };
