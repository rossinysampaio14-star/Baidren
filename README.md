# BAIDREN — e-commerce base funcional

Projeto inspirado na organização/experiência do site de referência informado, sem copiar código, identidade, textos exclusivos ou ativos proprietários.

## O que já funciona
- Home responsiva, catálogo e busca.
- Cards com tamanho e estoque individual.
- Carrinho persistente no navegador.
- Checkout com validação no backend.
- Preço/estoque recalculados no servidor.
- Banco SQLite com usuários, endereços, produtos, tamanhos, pedidos e pagamentos.
- Painel `/admin` protegido por sessão HttpOnly.
- Validação reforçada no checkout e proteção contra XSS no catálogo.
- O administrador não pode aprovar pagamento manualmente; essa mudança deve vir de webhook do gateway.
- Hash de senha com bcrypt.
- Rate limiting, Helmet, CSRF por token, validação server-side e cookies Secure/SameSite em produção.
- Estrutura preparada para gateway de pagamento e webhook.

## Rodar localmente
1. Instale Node.js 20+.
2. Copie `.env.example` para `.env` e defina `SESSION_SECRET` e `ADMIN_PASSWORD` fortes.
3. Execute `npm install`.
4. Execute `npm start`.
5. Acesse `http://localhost:3000`.
6. Painel administrativo: `http://localhost:3000/admin` (a rota é atendida pelo app; o login aparece pelo link “Área administrativa”).

## Antes de produção
- Configurar HTTPS/reverse proxy.
- Configurar gateway real (Pix/cartão) e webhook assinado.
- Configurar serviço de e-mail.
- Configurar Correios/transportadora para frete real.
- Configurar armazenamento de imagens (S3/R2/etc.) e validação de upload.
- Configurar domínio, DNS e backups do banco.
- Trocar todos os segredos do `.env` e, em produção, usar `SESSION_SECRET` com pelo menos 32 caracteres e `ADMIN_PASSWORD` com pelo menos 12 caracteres.
- Revisar textos jurídicos da LGPD com dados reais da empresa.
- Substituir os 3 produtos demonstrativos por produtos/imagens exatos e legalmente utilizáveis.
- Adicionar 2FA ao administrador antes da operação.

## Observação sobre pagamentos
O projeto não finge aprovação de pagamento. O pedido começa como `pending`; em produção, um gateway deve confirmar o pagamento via webhook assinado e então atualizar o status. Nenhum número completo de cartão é armazenado no banco.


## SEO e itens conferidos nos vídeos
- Favicon próprio e manifest adicionados.
- Title, meta description, canonical, Open Graph e Twitter Card são gerados no servidor.
- Schema.org WebSite na home e Product nas URLs `/tenis/<slug>`.
- `/sitemap.xml` é gerado a partir dos produtos ativos.
- `/robots.txt` bloqueia `/api/` e `/admin` para rastreadores.
- `/llms.txt` informa a identidade e regras de uso das informações públicas.
- Google Search Console pode ser conectado com `GOOGLE_SITE_VERIFICATION`.
- Google Analytics fica preparado por `GA_MEASUREMENT_ID` e Microsoft Clarity por `MICROSOFT_CLARITY_ID`; nenhum ID falso é incluído.
- Não foram adicionadas faixas com estatísticas, depoimentos, avaliações, seguidores ou números de vendas inventados.
- Não foram adicionados perfis/redes sociais fictícios.
- O catálogo inicial continua marcado como demonstrativo e deve ser substituído pelos produtos reais e imagens legalmente utilizáveis.

### Antes de publicar
Defina `STORE_URL` com o domínio real. Depois valide `sitemap.xml`, `robots.txt`, Search Console, dados estruturados e políticas da loja.
