const express = require('express');
const { generateToken, authMiddleware } = require('../auth');
const { register, login, getUser, updateUser, findOrCreateFromGoogle } = require('../auth/index');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    const user = await register(email, password, name);
    const token = generateToken(user);

    res.json({ user, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await login(email, password);
    const token = generateToken(user);

    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { idToken, email, name, googleId, avatar } = req.body;

    if (!email || !googleId) {
      return res.status(400).json({ error: 'Dados do Google incompletos' });
    }

    const user = await findOrCreateFromGoogle({
      email,
      name: name || email.split('@')[0],
      googleId,
      avatar: avatar || null,
    });

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      token,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Erro no login com Google' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json(user);
});

router.put('/me', authMiddleware, async (req, res) => {
  const { name } = req.body;
  const updated = await updateUser(req.userId, { name });
  if (!updated) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json(updated);
});

module.exports = router;