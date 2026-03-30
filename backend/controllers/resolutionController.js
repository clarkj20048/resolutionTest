const mongoose = require('mongoose');
const Resolution = require('../models/Resolution');
const RecentlyViewed = require('../models/RecentlyViewed');
const Counter = require('../models/Counter');

const getNumericId = (value) => {
  const numericId = Number.parseInt(value, 10);
  return Number.isNaN(numericId) ? null : numericId;
};

const normalizeResolutionKey = (value) => String(value || '').trim();

const buildResolutionLookup = (value) => {
  const key = normalizeResolutionKey(value);
  const numericId = getNumericId(key);
  const conditions = [];

  if (numericId !== null) {
    conditions.push({ resolutionId: numericId });
  }

  if (mongoose.Types.ObjectId.isValid(key)) {
    conditions.push({ _id: key });
  }

  if (conditions.length === 0) {
    return null;
  }

  return conditions.length === 1 ? conditions[0] : { $or: conditions };
};

const getNextSequence = async (name) => {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return counter.seq;
};

const parseMonthAndYear = (dateValue) => {
  if (!dateValue) {
    return { month: '', year: null };
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return { month: '', year: null };
  }

  return {
    month: parsedDate.toLocaleString('default', { month: 'long' }),
    year: parsedDate.getFullYear(),
  };
};

const buildResolutionPayload = (body = {}, fallbackStatus) => {
  const derived = parseMonthAndYear(body.date_docketed);
  const yearValue = body.year ? Number(body.year) : derived.year;

  return {
    title: body.title,
    description: body.description || body.title,
    category: body.category || '',
    status: body.status || fallbackStatus || 'pending',
    month: body.month || derived.month || '',
    year: Number.isNaN(yearValue) ? null : yearValue,
    file_path: body.file_path || '',
    date_docketed: body.date_docketed || '',
    date_published: body.date_published || '',
  };
};

const getResolutions = async (req, res) => {
  try {
    const resolutions = await Resolution.find({ status: { $ne: 'pending' } }).sort({ resolutionId: 1 });
    return res.json(resolutions);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch resolutions' });
  }
};

const getResolutionById = async (req, res) => {
  const lookup = buildResolutionLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }

  try {
    const resolution = await Resolution.findOne(lookup);
    if (!resolution) {
      return res.status(404).json({ error: 'Resolution not found' });
    }

    return res.json(resolution);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }
};

const createResolution = async (req, res) => {
  try {
    const payload = buildResolutionPayload(req.body, req.body.status || 'approved');
    payload.resolutionId = await getNextSequence('resolutionId');
    const resolution = new Resolution(payload);
    await resolution.save();

    return res.status(201).json({
      success: true,
      message: 'Resolution created successfully',
      resolution,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to create resolution' });
  }
};

const updateResolution = async (req, res) => {
  const lookup = buildResolutionLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }

  try {
    const existing = await Resolution.findOne(lookup);
    if (!existing) {
      return res.status(404).json({ error: 'Resolution not found' });
    }

    const payload = buildResolutionPayload(
      { ...existing.toJSON(), ...req.body, status: req.body.status || existing.status },
      existing.status
    );

    const updatedResolution = await Resolution.findOneAndUpdate(lookup, payload, {
      new: true,
      runValidators: true,
    });

    return res.json({
      success: true,
      message: 'Resolution updated successfully',
      resolution: updatedResolution,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to update resolution' });
  }
};

const deleteResolution = async (req, res) => {
  const lookup = buildResolutionLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }

  try {
    const resolution = await Resolution.findOneAndDelete(lookup);
    if (!resolution) {
      return res.status(404).json({ error: 'Resolution not found' });
    }

    await RecentlyViewed.deleteMany({ resolutionId: normalizeResolutionKey(req.params.id) });

    return res.json({ success: true, message: 'Resolution deleted successfully' });
  } catch (error) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }
};

const getPendingResolutions = async (req, res) => {
  try {
    const resolutions = await Resolution.find({ status: 'pending' }).sort({ resolutionId: 1 });
    return res.json(resolutions);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch pending resolutions' });
  }
};

const createPendingResolution = async (req, res) => {
  try {
    const payload = buildResolutionPayload(req.body, 'pending');
    payload.resolutionId = await getNextSequence('resolutionId');
    const resolution = new Resolution(payload);
    await resolution.save();

    return res.status(201).json({
      success: true,
      message: 'Pending resolution added successfully',
      resolutionId: resolution.id,
      resolution,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to create pending resolution' });
  }
};

const acceptPendingResolution = async (req, res) => {
  const lookup = buildResolutionLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }

  try {
    const resolution = await Resolution.findOneAndUpdate(
      { ...lookup, status: 'pending' },
      { status: 'approved' },
      { new: true }
    );

    if (!resolution) {
      return res.status(404).json({ error: 'Pending resolution not found' });
    }

    return res.json({
      success: true,
      message: 'Resolution accepted and transferred to resolutions',
      resolution,
    });
  } catch (error) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }
};

const rejectPendingResolution = async (req, res) => {
  const lookup = buildResolutionLookup(req.params.id);
  if (!lookup) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }

  try {
    const resolution = await Resolution.findOneAndDelete({ ...lookup, status: 'pending' });

    if (!resolution) {
      return res.status(404).json({ error: 'Pending resolution not found' });
    }

    return res.json({
      success: true,
      message: 'Pending resolution rejected and deleted',
    });
  } catch (error) {
    return res.status(400).json({ error: 'Invalid resolution ID' });
  }
};

const getRecentlyViewed = async (req, res) => {
  try {
    const recentlyViewed = await RecentlyViewed.find().sort({ viewedAt: -1 }).limit(10);
    return res.json(recentlyViewed);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch recently viewed resolutions' });
  }
};

const addRecentlyViewed = async (req, res) => {
  try {
    const { id, title, file_path, date_docketed, date_published } = req.body;
    const resolutionId = normalizeResolutionKey(id);

    if (!resolutionId || !title) {
      return res.status(400).json({ error: 'Resolution id and title are required' });
    }

    await RecentlyViewed.findOneAndDelete({ resolutionId });
    await RecentlyViewed.create({
      resolutionId,
      title,
      file_path: file_path || '',
      date_docketed: date_docketed || '',
      date_published: date_published || '',
      viewedAt: new Date(),
    });

    const records = await RecentlyViewed.find().sort({ viewedAt: -1 });
    const overflow = records.slice(10);

    if (overflow.length > 0) {
      await RecentlyViewed.deleteMany({
        _id: { $in: overflow.map((item) => item._id) },
      });
    }

    return res.json({
      success: true,
      message: 'Recently viewed updated',
      recentlyViewed: records.slice(0, 10),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update recently viewed list' });
  }
};

const clearRecentlyViewed = async (req, res) => {
  try {
    await RecentlyViewed.deleteMany({});
    return res.json({
      success: true,
      message: 'Recently viewed cleared',
      recentlyViewed: [],
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to clear recently viewed list' });
  }
};

module.exports = {
  getResolutions,
  getResolutionById,
  createResolution,
  updateResolution,
  deleteResolution,
  getPendingResolutions,
  createPendingResolution,
  acceptPendingResolution,
  rejectPendingResolution,
  getRecentlyViewed,
  addRecentlyViewed,
  clearRecentlyViewed,
};
