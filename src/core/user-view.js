const { monthYearLabel } = require('./time');

const ROLE_LABELS = {
  admin: 'Office head',
  staff: 'Staff',
  student: 'Student',
};

function roleLabel(role) {
  return ROLE_LABELS[role] || 'Student';
}

function initials(fullName) {
  if (typeof fullName !== 'string') {
    return '';
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function avatarVersion(avatarUpdatedAt) {
  const version = Date.parse(avatarUpdatedAt);
  return Number.isFinite(version) ? version : 0;
}

function avatarUrl(user) {
  if (!user || !user.id || !user.avatarType || !user.avatarValue) {
    return null;
  }
  return `/avatar/${user.id}?v=${avatarVersion(user.avatarUpdatedAt)}`;
}

function memberSinceLabel(createdAt) {
  return monthYearLabel(createdAt);
}

module.exports = {
  roleLabel,
  initials,
  avatarUrl,
  memberSinceLabel,
};
