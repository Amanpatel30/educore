export const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  roleId: user.roleId,
  role: user.roleDetails ? user.roleDetails.name : null,
  status: user.status,
});
