const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 放送委員の入室用パスワード（Renderの環境変数 MEMBER_PASSWORD で変更可能）
const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD || 'housou2026';

// 2. 管理者の編集用パスワード（Renderの環境変数 ADMIN_PASSWORD で変更可能）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'London21';

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 管理者チェック
function isAdmin(password) {
  return Boolean(password) && password === ADMIN_PASSWORD;
}

// 放送委員チェック（管理者パスワードでも入室・チェック可能）
function isMemberOrAdmin(password) {
  return Boolean(password) && (password === MEMBER_PASSWORD || password === ADMIN_PASSWORD);
}

app.use(express.static('public'));
app.use(express.json());

// 1. リクエスト一覧の取得（放送委員または管理者パスワード必須）
app.post('/api/requests/list', async (req, res) => {
  try {
    if (!isMemberOrAdmin(req.body.password)) {
      return res.status(401).json({ error: 'パスワードが違います' });
    }

    const result = await pool.query('SELECT * FROM requests ORDER BY id ASC');
    const formatted = result.rows.map(row => ({
      id: Number(row.id),
      text: row.text,
      checked: row.checked,
      createdAt: row.created_at
    }));
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'データ取得エラー' });
  }
});

// 2. 管理者モード認証API
app.post('/api/verify-admin', (req, res) => {
  if (isAdmin(req.body.password)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '管理者パスワードが違います' });
  }
});

// 3. 新規リクエスト送信（フォームから誰でも送信可能）
app.post('/api/requests', async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: '曲名を入力してください' });

    const now = Date.now();
    const nowJST = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    await pool.query(
      'INSERT INTO requests (id, text, checked, created_at) VALUES ($1, $2, $3, $4)',
      [now, text, false, nowJST]
    );

    res.json({ message: 'リクエストを受け付けました！' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '送信エラー' });
  }
});

// 4. チェック状態にする（放送委員または管理者なら誰でも実行可能・一度チェックするとロック）
app.patch('/api/requests/:id/check', async (req, res) => {
  try {
    if (!isMemberOrAdmin(req.body.password)) {
      return res.status(403).json({ error: '権限がありません' });
    }
    const id = Number(req.params.id);
    await pool.query('UPDATE requests SET checked = true WHERE id = $1', [id]);
    res.json({ message: 'チェック完了' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新エラー' });
  }
});

// 5. リクエストの削除（管理者パスワード必須）
app.delete('/api/requests/:id', async (req, res) => {
  try {
    if (!isAdmin(req.body.adminPassword)) {
      return res.status(403).json({ error: '管理者権限がありません' });
    }
    const id = Number(req.params.id);
    await pool.query('DELETE FROM requests WHERE id = $1', [id]);
    res.json({ message: '削除完了' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '削除エラー' });
  }
});

app.listen(PORT, () => {
  console.log(`放送委員会リクエストサーバー起動中: ポート ${PORT}`);
});
