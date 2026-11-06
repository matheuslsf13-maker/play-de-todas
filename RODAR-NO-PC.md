# 💻 Rodar o Play de Todas no seu computador (Windows)

Passo a passo para ter o projeto inteiro em `C:\Playdesexta` e trabalhar nele
localmente (inclusive com o Claude Code rodando na sua máquina).

## 1. Instalar o que precisa (uma vez só)

- **Git** — <https://git-scm.com/download/win> (Next, Next, Install)
- **Node.js LTS** — <https://nodejs.org> (versão LTS, Next até o fim)

Depois **feche e abra o terminal** para ele enxergar os dois.

Para conferir, no **PowerShell**:

```powershell
git --version
node --version
```

## 2. Baixar o projeto

No PowerShell:

```powershell
cd C:\
git clone https://github.com/matheuslsf13-maker/play-da-sexta.git Playdesexta
cd C:\Playdesexta
npm install
```

O `git clone` já traz **tudo**: código, imagens, scripts SQL e o histórico.

## 3. Rodar

```powershell
cd C:\Playdesexta
npm run dev
```

Abre <http://localhost:5173> no navegador. É o app inteiro, apontando para o
**mesmo Supabase** do site publicado — ou seja, os dados são os de verdade.
Faça login normalmente para editar.

> Quer testar sem mexer nos dados reais? Crie um arquivo `.env.local` na pasta
> com `VITE_SUPABASE_URL=local` e `VITE_SUPABASE_ANON_KEY=local`. O app cai no
> **modo local** e guarda tudo só no navegador. (Vazias não servem: aí o app usa
> o Supabase de verdade de `src/config.ts`.)

Para parar o servidor: `Ctrl + C` no terminal.

## 4. Comandos do dia a dia

```powershell
npm run dev        # roda o app na sua máquina
npm run build      # gera a versão de produção (checa erros de TypeScript)
git pull           # traz o que foi alterado no GitHub
git add -A
git commit -m "o que você mudou"
git push           # publica: o site atualiza sozinho em ~2 minutos
```

Todo push na branch `main` dispara o GitHub Actions e republica o site.

## 5. Usando o Claude Code aqui

```powershell
cd C:\Playdesexta
claude
```

O arquivo `CLAUDE.md` na raiz já explica o projeto para ele — assim ele não
precisa vasculhar tudo de novo a cada conversa.

## 6. Banco de dados

Os scripts em `supabase/` rodam no **SQL Editor** do Supabase, na ordem:

| Arquivo | O que faz |
| --- | --- |
| `schema.sql` | tabelas, permissões, tempo real, bucket de fotos |
| `02-escolhas-do-mes.sql` | escolha de usar/preservar o status no fim do mês |
| `03-apelidos.sql` | apelidos das jogadoras (importação da lista) |
| `04-partida-iniciada.sql` | marca a partida que está em quadra agora |
