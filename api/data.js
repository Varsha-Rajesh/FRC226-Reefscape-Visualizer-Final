const { google } = require('googleapis');

module.exports = async (req, res) => {
  try {
    const values = await readSheet('Data', 'A1:ZZ1000');
    res.status(200).json({ data: values });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Data tab' });
  }
};

async function readSheet(tab, range) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], 
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const spreadsheetId = '1Ma8po0kOLEJDOt_Nhh4wr77o8nMkmMT7';
  const fullRange = `${tab}!${range}`;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: fullRange,
  });

  return res.data.values;
}
