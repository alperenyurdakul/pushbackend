const express = require('express');
const router = express.Router();

// Mock user data
let users = [
  {
    id: '1',
    username: 'demo_user',
    email: 'demo@example.com',
    createdAt: new Date()
  }
];

// Get all users
router.get('/', (req, res) => {
  try {
    const usersWithoutPassword = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    }));
    
    res.json(usersWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Get user by ID
router.get('/:id', (req, res) => {
  try {
    const user = users.find(u => u.id === req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }

    const userWithoutPassword = {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    };

    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Update user
router.put('/:id', (req, res) => {
  try {
    const { username, email } = req.body;
    const userIndex = users.findIndex(u => u.id === req.params.id);
    
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }

    users[userIndex] = {
      ...users[userIndex],
      username: username || users[userIndex].username,
      email: email || users[userIndex].email,
      updatedAt: new Date()
    };

    const userWithoutPassword = {
      id: users[userIndex].id,
      username: users[userIndex].username,
      email: users[userIndex].email,
      createdAt: users[userIndex].createdAt,
      updatedAt: users[userIndex].updatedAt
    };

    res.json({
      message: 'Kullanıcı güncellendi!',
      user: userWithoutPassword
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Delete user
router.delete('/:id', (req, res) => {
  try {
    const userIndex = users.findIndex(u => u.id === req.params.id);
    
    if (userIndex === -1) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }

    users.splice(userIndex, 1);
    
    res.json({ message: 'Kullanıcı silindi!' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

module.exports = router; 