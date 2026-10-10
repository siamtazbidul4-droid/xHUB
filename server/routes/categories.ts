import { Router } from 'express';
import { db, createObjectId } from '../db.js';
import { requireAdmin, AuthenticatedRequest } from '../auth.js';

const router = Router();

// Get all categories
router.get('/', (req, res) => {
  // Recalculate counts dynamically
  const categories = db.categories.map(cat => {
    let count = 0;
    if (cat.name === 'All') {
      count = db.videos.filter(v => v.visibility === 'public' && (v.status === 'published' || v.status === 'ready')).length;
    } else {
      count = db.videos.filter(v => v.category.toLowerCase() === cat.name.toLowerCase() && v.visibility === 'public').length;
    }
    return {
      ...cat,
      videoCount: count
    };
  });

  return res.json({ categories });
});

// Admin: Add Category
router.post('/', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { name, description = '' } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const existing = db.categories.find(c => c.slug === slug);
  if (existing) {
    return res.status(409).json({ error: 'A category with this name already exists.' });
  }

  const newCat = {
    _id: createObjectId(),
    name: name.trim(),
    slug,
    description: description.trim(),
    videoCount: 0
  };

  db.categories.push(newCat);
  db.save();

  return res.status(201).json({ category: newCat });
});

// Admin: Delete Category
router.delete('/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const index = db.categories.findIndex(c => c._id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Category not found.' });
  }

  if (db.categories[index].name === 'All') {
    return res.status(400).json({ error: 'The default "All" category cannot be removed.' });
  }

  db.categories.splice(index, 1);
  db.save();

  return res.json({ message: 'Category removed.' });
});

export default router;
