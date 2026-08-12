const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'dev-only-session-secret-change-this-before-production-123456789';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  'admin-password-change-this';

const dataDir = path.join(__dirname, 'data');

try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (e) {
  console.warn('Não foi possível criar a pasta data:', e.message);
}

const db = new Database(path.join(dataDir, 'baidren.sqlite'));

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT,
  cpf TEXT,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  preco INTEGER NOT NULL,
  preco_promocional INTEGER,
  categoria TEXT NOT NULL,
  cor TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  tamanho TEXT NOT NULL,
  estoque INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id,tamanho),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  desconto INTEGER NOT NULL DEFAULT 0,
  frete INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  endereco_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  tamanho TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  preco INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  gateway TEXT NOT NULL,
  transaction_id TEXT,
  status TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  cep TEXT,
  rua TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

if (!db.prepare('SELECT id FROM admin_users WHERE username=?').get(ADMIN_USER)) {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);

  db.prepare(
    'INSERT INTO admin_users(username,password_hash) VALUES (?,?)'
  ).run(ADMIN_USER, hash);
}

const count = db.prepare('SELECT COUNT(*) c FROM products').get().c;

if (!count) {
  const seed = db.prepare(`
    INSERT INTO products
    (nome,marca,modelo,sku,descricao,preco,preco_promocional,categoria,cor,material)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  const p1 = seed.run(
    'Runner Core Black',
    'BAIDREN',
    'Runner Core',
    'BD-RUN-001',
    'Modelo demonstrativo.',
    34900,
    29900,
    'Masculino',
    'Preto',
    'Sintético'
  ).lastInsertRowid;

  const p2 = seed.run(
    'Street Pulse White',
    'BAIDREN',
    'Street Pulse',
    'BD-STP-002',
    'Modelo demonstrativo.',
    39900,
    null,
    'Feminino',
    'Branco',
    'Têxtil'
  ).lastInsertRowid;

  const p3 = seed.run(
    'Urban Motion Grey',
    'BAIDREN',
    'Urban Motion',
    'BD-URB-003',
    'Modelo demonstrativo.',
    42900,
    37900,
    'Lançamentos',
    'Cinza',
    'Mesh'
  ).lastInsertRowid;

  const img = db.prepare(
    'INSERT INTO product_images(product_id,url,ordem) VALUES (?,?,?)'
  );

  const svg = label =>
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
        <rect width="800" height="600" fill="#111"/>
        <text x="50%" y="45%" text-anchor="middle"
          fill="#fff" font-family="Arial" font-size="54">BAIDREN</text>
        <text x="50%" y="56%" text-anchor="middle"
          fill="#aaa" font-family="Arial" font-size="28">${label}</text>
      </svg>
    `);

  img.run(p1, svg('Imagem configurável'), 0);
  img.run(p2, svg('Imagem configurável'), 0);
  img.run(p3, svg('Imagem configurável'), 0);

  const sz = db.prepare(
    'INSERT INTO product_sizes(product_id,tamanho,estoque) VALUES (?,?,?)'
  );

  for (const p of [p1, p2, p3]) {
    for (const [s, e] of [
      ['34', 0],
      ['35', 2],
      ['36', 5],
      ['37', 8],
      ['38', 10],
      ['39', 7],
      ['40', 4],
      ['41', 3],
      ['42', 1],
      ['43', 0],
      ['44', 0]
    ]) {
      sz.run(p, s, e);
    }
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(
  express.static(__dirname, {
    maxAge: '1h',
    index: false
  })
);

function signSession(payload) {
  return jwt.sign(payload, SESSION_SECRET, { expiresIn: '2h' });
}

function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.ba_admin;

    if (!token) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    req.admin = jwt.verify(token, SESSION_SECRET);

    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida' });
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function storeUrl() {
  return String(
    process.env.STORE_URL ||
      process.env.VERCEL_URL ||
      'http://localhost:' + PORT
  ).replace(/\/$/, '');
}

function publicHtml({
  title,
  description,
  pathName = '/',
  jsonLd = null
} = {}) {
  const index = fs.readFileSync(
    path.join(__dirname, 'index.html'),
    'utf8'
  );

  const safeTitle =
    title || 'BAIDREN — Seu próximo tênis está aqui';

  const safeDescription =
    description ||
    'BAIDREN — loja de tênis com catálogo, tamanhos, estoque e checkout configurável.';

  const canonical = storeUrl() + pathName;

  const verification = process.env.GOOGLE_SITE_VERIFICATION
    ? `<meta name="google-site-verification" content="${String(
        process.env.GOOGLE_SITE_VERIFICATION
      ).replace(/[^A-Za-z0-9_-]/g, '')}">`
    : '';

  const ld = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(
        /</g,
        '\\u003c'
      )}</script>`
    : '';

  return index.replace(
    '</head>',
    `<title>${safeTitle}</title>
<meta name="description" content="${safeDescription.replace(
      /"/g,
      '&quot;'
    )}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="BAIDREN">
<meta property="og:title" content="${safeTitle.replace(
      /"/g,
      '&quot;'
    )}">
<meta property="og:description" content="${safeDescription.replace(
      /"/g,
      '&quot;'
    )}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
${verification}
${ld}
</head>`
  );
}

function productBySlug(slug) {
  const products = db
    .prepare('SELECT * FROM products WHERE ativo=1')
    .all();

  return products.find(
    p =>
      slugify(p.nome) === slug ||
      slugify(p.modelo) === slug ||
      slugify(`${p.marca}-${p.modelo}`) === slug
  );
}

function csrf(req, res, next) {
  let token = req.cookies.ba_csrf;

  if (!token) {
    token = crypto.randomBytes(24).toString('hex');

    res.cookie('ba_csrf', token, {
      httpOnly: false,
      secure: IS_PROD,
      sameSite: 'lax'
    });
  }

  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    req.path !== '/api/admin/login'
  ) {
    if (req.headers['x-csrf-token'] !== token) {
      return res.status(403).json({ error: 'CSRF inválido' });
    }
  }

  req.csrfToken = token;

  next();
}

app.use(csrf);

app.get('/api/csrf', (req, res) => {
  res.json({ token: req.csrfToken });
});

app.get('/api/products', (req, res) => {
  const rows = db
    .prepare(`
      SELECT
        p.*,
        COALESCE(
          MIN(CASE WHEN ps.estoque > 0 THEN ps.estoque END),
          0
        ) disponivel
      FROM products p
      LEFT JOIN product_sizes ps
        ON ps.product_id = p.id
      WHERE p.ativo = 1
      GROUP BY p.id
      ORDER BY p.id DESC
    `)
    .all();

  const images = db
    .prepare('SELECT product_id,url FROM product_images ORDER BY ordem')
    .all();

  const sizes = db
    .prepare(
      'SELECT product_id,tamanho,estoque FROM product_sizes ORDER BY CAST(tamanho AS INTEGER)'
    )
    .all();

  const out = rows.map(p => ({
    ...p,
    images: images
      .filter(i => i.product_id === p.id)
      .map(i => i.url),
    sizes: sizes.filter(s => s.product_id === p.id)
  }));

  res.json(out);
});

app.post('/api/orders', (req, res) => {
  const {
    items,
    address,
    email,
    name,
    phone,
    paymentMethod = 'pix'
  } = req.body;

  if (
    !Array.isArray(items) ||
    !items.length ||
    !address ||
    !name ||
    !email
  ) {
    return res.status(400).json({
      error: 'Dados incompletos'
    });
  }

  if (
    typeof name !== 'string' ||
    name.trim().length < 3 ||
    name.length > 120
  ) {
    return res.status(400).json({
      error: 'Nome inválido'
    });
  }

  if (
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 160
  ) {
    return res.status(400).json({
      error: 'E-mail inválido'
    });
  }

  if (typeof phone !== 'string' || phone.length > 30) {
    return res.status(400).json({
      error: 'Telefone inválido'
    });
  }

  if (
    typeof address !== 'object' ||
    typeof address.cep !== 'string' ||
    typeof address.rua !== 'string' ||
    typeof address.numero !== 'string' ||
    typeof address.cidade !== 'string'
  ) {
    return res.status(400).json({
      error: 'Endereço incompleto'
    });
  }

  const getProduct = db.prepare(
    'SELECT * FROM products WHERE id=? AND ativo=1'
  );

  const getSize = db.prepare(
    'SELECT * FROM product_sizes WHERE product_id=? AND tamanho=?'
  );

  let subtotal = 0;
  const normalized = [];

  try {
    for (const item of items) {
      const p = getProduct.get(Number(item.productId));

      const s = getSize.get(
        Number(item.productId),
        String(item.size)
      );

      const qty = Math.max(
        1,
        Math.min(10, Number(item.quantity) || 1)
      );

      if (!p || !s || s.estoque < qty) {
        throw new Error('Produto/tamanho sem estoque');
      }

      const price =
        p.preco_promocional ?? p.preco;

      subtotal += price * qty;

      normalized.push({
        p,
        s,
        qty,
        price
      });
    }

    const frete = subtotal >= 50000 ? 0 : 1990;
    const total = subtotal + frete;

    const tx = db.transaction(() => {
      const order = db
        .prepare(`
          INSERT INTO orders
          (status,payment_status,subtotal,desconto,frete,total,endereco_json)
          VALUES (?,?,?,?,?,?,?)
        `)
        .run(
          'Aguardando pagamento',
          'pending',
          subtotal,
          0,
          frete,
          total,
          JSON.stringify({
            name,
            email,
            phone,
            ...address
          })
        );

      const oi = db.prepare(`
        INSERT INTO order_items
        (order_id,product_id,tamanho,quantidade,preco)
        VALUES (?,?,?,?,?)
      `);

      const us = db.prepare(`
        UPDATE product_sizes
        SET estoque=estoque-?
        WHERE product_id=? AND tamanho=?
      `);

      for (const x of normalized) {
        oi.run(
          order.lastInsertRowid,
          x.p.id,
          x.s.tamanho,
          x.qty,
          x.price
        );

        us.run(
          x.qty,
          x.p.id,
          x.s.tamanho
        );
      }

      const transactionId = crypto.randomUUID();

      db.prepare(`
        INSERT INTO payments
        (order_id,gateway,transaction_id,status,amount)
        VALUES (?,?,?,?,?)
      `).run(
        order.lastInsertRowid,
        process.env.PAYMENT_GATEWAY || 'mock',
        transactionId,
        'pending',
        total
      );

      return {
        id: order.lastInsertRowid,
        transactionId,
        total,
        paymentMethod
      };
    });

    res.status(201).json({
      success: true,
      order: tx,
      message:
        'Pedido criado. O pagamento só será aprovado após confirmação oficial do gateway.'
    });
  } catch (e) {
    res.status(400).json({
      error: e.message
    });
  }
});

app.post(
  '/api/admin/login',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: {
      error: 'Muitas tentativas. Aguarde alguns minutos.'
    }
  }),
  (req, res) => {
    const {
      username,
      password
    } = req.body;

    const u = db
      .prepare(
        'SELECT * FROM admin_users WHERE username=?'
      )
      .get(username || '');

    if (
      !u ||
      !bcrypt.compareSync(
        password || '',
        u.password_hash
      )
    ) {
      return res.status(401).json({
        error: 'Credenciais inválidas'
      });
    }

    const token = signSession({
      sub: u.id,
      username: u.username,
      role: 'admin'
    });

    res.cookie('ba_admin', token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000
    });

    res.json({
      success: true
    });
  }
);

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('ba_admin');
  res.json({
    success: true
  });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({
    username: req.admin.username,
    role: req.admin.role
  });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  res.json(
    db
      .prepare(
        'SELECT * FROM orders ORDER BY id DESC LIMIT 100'
      )
      .all()
  );
});

app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(
    db
      .prepare(
        'SELECT * FROM products ORDER BY id DESC'
      )
      .all()
  );
});

app.patch(
  '/api/admin/orders/:id',
  requireAdmin,
  (req, res) => {
    const allowed = [
      'Pedido em preparação',
      'Pedido enviado',
      'Em transporte',
      'Entregue',
      'Cancelado'
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        error: 'Status inválido'
      });
    }

    db.prepare(
      'UPDATE orders SET status=? WHERE id=?'
    ).run(
      req.body.status,
      req.params.id
    );

    res.json({
      success: true
    });
  }
);

app.post(
  '/api/admin/products',
  requireAdmin,
  (req, res) => {
    const {
      nome,
      marca,
      modelo,
      sku,
      descricao = '',
      preco,
      preco_promocional = null,
      categoria,
      cor = '',
      material = '',
      sizes = []
    } = req.body;

    if (
      !nome ||
      !marca ||
      !modelo ||
      !sku ||
      !categoria ||
      !Number.isInteger(preco)
    ) {
      return res.status(400).json({
        error: 'Campos obrigatórios inválidos'
      });
    }

    try {
      const tx = db.transaction(() => {
        const p = db
          .prepare(`
            INSERT INTO products
            (nome,marca,modelo,sku,descricao,preco,
             preco_promocional,categoria,cor,material)
            VALUES (?,?,?,?,?,?,?,?,?,?)
          `)
          .run(
            nome,
            marca,
            modelo,
            sku,
            descricao,
            preco,
            preco_promocional,
            categoria,
            cor,
            material
          );

        const s = db.prepare(
          'INSERT INTO product_sizes(product_id,tamanho,estoque) VALUES (?,?,?)'
        );

        for (const x of sizes) {
          s.run(
            p.lastInsertRowid,
            String(x.tamanho),
            Math.max(
              0,
              Number(x.estoque) || 0
            )
          );
        }

        return p.lastInsertRowid;
      });

      res.status(201).json({
        id: tx
      });
    } catch {
      res.status(400).json({
        error:
          'SKU já existente ou dados inválidos'
      });
    }
  }
);

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Sitemap: ${storeUrl()}/sitemap.xml
`
  );
});

app.get('/llms.txt', (req, res) => {
  res.type('text/plain').send(
    `# BAIDREN

BAIDREN é uma loja virtual de tênis.

Site: ${storeUrl()}
Catálogo: ${storeUrl()}/tenis

Não invente preços, estoque, avaliações ou informações empresariais.
`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const base = storeUrl();

  const products = db
    .prepare(
      'SELECT nome FROM products WHERE ativo=1'
    )
    .all();

  const urls = ['/','/tenis'].concat(
    products.map(
      p => '/tenis/' + slugify(p.nome)
    )
  );

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls
      .map(
        u =>
          `<url><loc>${base}${u}</loc></url>`
      )
      .join('') +
    '</urlset>';

  res.type('application/xml').send(xml);
});

app.get('/admin', (req, res) => {
  res.type('html').send(
    publicHtml({
      title: 'BAIDREN Admin — Acesso restrito',
      description:
        'Área administrativa protegida da BAIDREN.',
      pathName: '/admin'
    })
  );
});

app.get('/tenis/:slug', (req, res) => {
  const p = productBySlug(req.params.slug);

  if (!p) {
    return res
      .status(404)
      .type('html')
      .send(
        publicHtml({
          title:
            'Produto não encontrado — BAIDREN',
          description:
            'O produto solicitado não foi encontrado.',
          pathName: req.path
        })
      );
  }

  const image = db
    .prepare(
      'SELECT url FROM product_images WHERE product_id=? ORDER BY ordem LIMIT 1'
    )
    .get(p.id)?.url;

  const price = (
    (p.preco_promocional ?? p.preco) /
    100
  ).toFixed(2);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.nome,
    brand: {
      '@type': 'Brand',
      name: p.marca
    },
    description: p.descric
