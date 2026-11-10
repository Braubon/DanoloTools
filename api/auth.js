// Función de Vercel: /api/auth/ — la lógica está en tools/fabula-ultima/servidor/web.js
import { auth } from '../tools/fabula-ultima/servidor/web.js';

export default { fetch: auth };
