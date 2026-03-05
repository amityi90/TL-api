const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  images: [{
    type: String // URLs to images
  }],
  category: {
    type: String,
    required: true,
    enum: ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Watches', 'Other']
  },
  material: {
    type: String,
    required: true
  },
  stockCount: {
    type: Number,
    required: true,
    min: 0,
    default: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Product', productSchema);
