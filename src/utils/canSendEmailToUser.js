const Settings = require("../models/Settings");

const canSendEmailToUser = async (targetUserDoc) => {
    if (!targetUserDoc) return true;

    const isTargetAdmin = ['Admin', 'SuperAdmin'].includes(targetUserDoc.role);

    // 1. Fetch the absolute truth from the database
    let globalSettings = await Settings.findOne();
    if (!globalSettings) {
        globalSettings = { globalAdminNotifications: true, globalEmployeeNotifications: true };
    }

    // 2. Check the Master Switches
    const masterAllows = isTargetAdmin
        ? globalSettings.globalAdminNotifications
        : globalSettings.globalEmployeeNotifications;

    // 3. Check the Target User's Personal Switches (from their User profile)
    const targetSwitch = isTargetAdmin
        ? targetUserDoc.preferences?.adminNotifications
        : targetUserDoc.preferences?.employeeNotifications;

    const targetAllows = (targetSwitch === false || targetSwitch === 'false') ? false : true;

    // 4. Both must be true to send
    return masterAllows && targetAllows;
};

module.exports = { canSendEmailToUser }