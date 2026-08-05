// ---------------------------------------------------------------------------
// src/config/repo.js
// MongoDB repository helpers. Each function maps a SQL query to the
// equivalent Mongoose operation and returns plain objects with the same
// shape the controllers expect (numeric `id`, `created_at`, etc.).
// ---------------------------------------------------------------------------
function mongoModelsLazy() {
  // Lazy require avoids the db <-> repo circular dependency.
  return require('./db').mongoModels();
}

function plain(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  delete o._id;
  delete o.__v;
  return o;
}

// Next auto-increment id for a collection.
async function nextId(Model, name) {
  const { IdCounter } = mongoModelsLazy();
const counter = await IdCounter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return counter.seq;
}

module.exports = {
  plain,
  nextId,
  mongoModels: mongoModelsLazy
};
