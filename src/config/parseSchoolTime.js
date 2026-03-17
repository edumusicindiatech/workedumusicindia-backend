const parseSchoolTime = (timeStr) => {
    // Assuming timeStr format is "HH:MM AM/PM" or "HH:MM"
    const now = new Date();
    const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);

    if (!timeMatch) return now; // Fallback if format is weird

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const modifier = timeMatch[3];

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    now.setHours(hours, minutes, 0, 0);
    return now;
};

module.exports = parseSchoolTime