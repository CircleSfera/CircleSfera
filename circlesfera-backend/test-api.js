const axios = require('axios');
async function run() {
  try {
    // Assuming backend runs on port 3000? Let's check
    const res = await axios.get('http://localhost:3000/api/admin/users', {
      params: {
        page: 1,
        limit: 15,
        search: '',
        role: 'ADMIN,MODERATOR,SUPPORT,FINANCE',
      },
      headers: {
        Authorization: 'Bearer ' + 'TOKEN_HERE', // wait, I don't have a token.
      },
    });
    console.log(res.data);
  } catch (e) {
    console.error(e.response ? e.response.status : e.message);
  }
}
run();
