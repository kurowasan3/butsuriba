-- ぶつりば：学習記録の同期用（Supabase の SQL Editor で1回だけ実行する）
--
-- アカウントは Lemma（受験数学）と共通の Supabase プロジェクト「lemma」を使う（同じメールなら同じユーザー）。
-- 学習記録はアプリごとに別の表に分ける：Lemma は public.lemma_state、ぶつりばは public.butsuriba_state。
-- 1人1行。各ユーザーは自分の行だけを読み書きできる（行単位のアクセス制限 RLS）。
--
-- 実行の順番（同じプロジェクトで Lemma の準備が済んでいる前提）：
--   1. このファイル（表・RLS）
--   2. supabase/guard.sql（サーバー側の検査。Lemma と同じ関数 lemma_private.lemma_state_guard を、この表にもつなぐ）
--      ※ Lemma 側で guard.sql の新しい版を適用済みなら、ぶつりばの guard.sql は末尾のトリガーの3行だけを実行する
--        （古い版の関数で Lemma の新しい関数を上書きしないため。版は select lemma_private.guard_version(); で確かめる）

create table if not exists public.butsuriba_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null,
  rev        integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint state_size check (pg_column_size(state) < 5000000)
);

alter table public.butsuriba_state enable row level security;

drop policy if exists "自分の記録を読む" on public.butsuriba_state;
drop policy if exists "自分の記録を作る" on public.butsuriba_state;
drop policy if exists "自分の記録を更新" on public.butsuriba_state;
drop policy if exists "自分の記録を消す" on public.butsuriba_state;
create policy "自分の記録を読む" on public.butsuriba_state
  for select using (auth.uid() = user_id);
create policy "自分の記録を作る" on public.butsuriba_state
  for insert with check (auth.uid() = user_id);
create policy "自分の記録を更新" on public.butsuriba_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "自分の記録を消す" on public.butsuriba_state
  for delete using (auth.uid() = user_id);

-- 退会（public.delete_my_account）は Lemma の schema.sql で作成済みのものをそのまま使う。
-- アカウントごと消すので、on delete cascade で lemma_state・butsuriba_state の両方の記録が消える。
