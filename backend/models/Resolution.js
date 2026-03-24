const mongoose = require('mongoose');

const resolutionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      default: 'pending',
      trim: true,
    },
    month: {
      type: String,
      default: '',
      trim: true,
    },
    year: {
      type: Number,
      default: null,
    },
    file_path: {
      type: String,
      default: '',
      trim: true,
    },
    date_docketed: {
      type: String,
      default: '',
      trim: true,
    },
    date_published: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        ret.created_at = ret.createdAt;
        delete ret._id;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('Resolution', resolutionSchema);
