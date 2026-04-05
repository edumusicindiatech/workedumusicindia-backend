const getISTDateString = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date); // Returns strict YYYY-MM-DD in IST
};

const getISTDayOfWeek = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata', weekday: 'short'
    });
    return formatter.format(date); // Returns 'Sun', 'Mon', 'Tue', etc.
};

module.exports = { getISTDateString, getISTDayOfWeek };