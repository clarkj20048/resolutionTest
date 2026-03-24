const mongoose = require('mongoose');

const recentlyViewedSchema = new mongoose.Schema(
  {
    resolutionId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
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
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret.resolutionId;
        ret.viewed_at = ret.viewedAt;
        delete ret._id;
        delete ret.resolutionId;
        delete ret.viewedAt;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('RecentlyViewed', recentlyViewedSchema);
