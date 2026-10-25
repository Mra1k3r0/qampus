const { seedDatabase } = require('../../src/core/seed');

const TEST_OPEN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TEST_SERVICE_HOURS = { opensAt: '00:00', closesAt: '23:59' };

function seedTestDatabase(db, options = {}) {
  return seedDatabase(db, {
    studentCount: 6,
    includeTickets: false,
    openDays: TEST_OPEN_DAYS,
    serviceHours: TEST_SERVICE_HOURS,
    ...options,
  });
}

module.exports = {
  seedTestDatabase,
};
