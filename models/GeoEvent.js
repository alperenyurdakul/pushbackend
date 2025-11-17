const mongoose = require('mongoose');

const GeoEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  regionId: { type: String, required: true, index: true },
  type: { type: String, enum: ['enter', 'exit', 'dwell'], required: true, index: true },
  latitude: { type: Number },
  longitude: { type: Number },
  ts: { type: Date, default: Date.now },
  source: { type: String, default: 'manual', index: true },
  distanceAtTrigger: { type: Number },
  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

GeoEventSchema.index({ userId: 1, regionId: 1, type: 1, createdAt: -1 });
GeoEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GeoEvent', GeoEventSchema);


