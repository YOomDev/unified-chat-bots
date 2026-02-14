export default {
    name: 'lifeage',
    async reply(params, client, event) {
        if (params.length < 2) {
            client.sendMessage(`Usage: !lifeage <month> <year> (e.g., !lifeage 3 1995)`);
            return;
        }

        const month = parseInt(params[0]);
        const year = parseInt(params[1]);
        const now = new Date();

        if (isNaN(month) || month < 1 || month > 12) {
            client.sendMessage('Month must be a number between 1 and 12');
            return;
        }

        if (isNaN(year) || year < 1900 || year > now.getFullYear()) {
            client.sendMessage(`Please provide a valid year (1900-${now.getFullYear()})`);
            return;
        }

        const birthDate = new Date(year, month - 1, 1);
        let years = now.getFullYear() - birthDate.getFullYear();
        let months = now.getMonth() - birthDate.getMonth();

        if (months < 0) {
            years--;
            months += 12;
        }

        if (now.getDate() < 1) {
            months--;
            if (months < 0) {
                years--;
                months += 12;
            }
        }

        const yearsStr = years === 1 ? 'year' : 'years';
        const monthsStr = months === 1 ? 'month' : 'months';
        
        client.sendMessage(`You are ${years} ${yearsStr}, ${months} ${monthsStr} old`);
    }
}
