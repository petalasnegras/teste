# Gestão de Futsal

Site estático (HTML + CSS + JavaScript puro) para gerenciar um time de futsal, com Supabase como backend.

- **Login restrito**: só entra quem existe em `auth.users` **e** está na tabela `admins`.
- **Perfil do clube**: nome, apelido, fundação, cidade, ginásio, cores, contatos, descrição e escudo.
- **Elenco**: cadastro, edição e exclusão de jogadores, com foto, posição, nº da camisa, medidas, pé dominante, contato, status e observações. Busca e filtros por posição e status.
- **Jogos**: agenda e resultados (adversário, data, horário, mando, competição, local, placar e observações), com resumo de vitórias, empates, derrotas e gols.
- **Treinos**: agenda de treinos (data, horário, local, foco) com **lista de presença** dos jogadores e média de presentes.

## Configuração (10 minutos)

### 1. Criar o projeto no Supabase
Crie um projeto gratuito em <https://supabase.com>.

### 2. Rodar o SQL
No painel: **SQL Editor > New query**, cole o conteúdo de `supabase.sql` e execute. Isso cria as tabelas, as políticas de segurança (RLS) e o bucket de imagens `club-media`.

Depois, em outra query, rode também o `supabase-jogos-treinos.sql`, que cria as tabelas de jogos, treinos e presença (com a mesma proteção: só administradores acessam).

### 3. Fechar o cadastro público
Em **Authentication > Sign In / Providers > Email**, **desative "Allow new users to sign up"**. Assim ninguém consegue criar conta pelo site.

### 4. Criar o administrador
1. **Authentication > Users > Add user > Create new user**: informe e-mail e senha e marque **Auto Confirm User**.
2. No SQL Editor, rode (trocando o e-mail):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```
Repita para cada administrador adicional.

### 5. Conectar o site
Em **Project Settings > API**, copie a **Project URL** e a chave **anon / publishable** e cole em `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "sua-chave-anon"
};
```

A chave anon é pública por natureza; quem protege os dados são as políticas RLS do passo 2. **Nunca** coloque a chave `service_role` no site.

### 6. Publicar
Abra `index.html` direto no navegador para testar, ou publique a pasta em qualquer hospedagem estática (Netlify, Vercel, GitHub Pages, Cloudflare Pages). Depois de publicar, adicione a URL do site em **Authentication > URL Configuration > Site URL**.

## Como a segurança funciona
- Todas as tabelas têm RLS ativado e uma única política: `is_admin()`. Um usuário autenticado que não esteja em `admins` não lê nem grava nada.
- O site também confere a tabela `admins` após o login e desconecta quem não for administrador.
- Imagens são públicas para leitura (precisam ser exibidas), mas só admins enviam, alteram ou apagam.

## Estrutura
```
index.html    telas de login, clube e elenco
style.css     estilos
config.js     URL e chave do Supabase
app.js        lógica (autenticação, clube, elenco)
supabase.sql  schema, RLS e storage (clube, elenco, admins)
supabase-jogos-treinos.sql  tabelas de jogos, treinos e presença
```
