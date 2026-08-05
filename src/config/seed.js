// ---------------------------------------------------------------------------
// src/config/seed.js
// Seeds default data into MongoDB on first boot: admin user, departments,
// crew members, and site settings. Mirrors database.js seedDefaults().
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { mongoModels } = require('./db');
const { nextId } = require('./repo');

async function nextSeq(Model, tableName) {
  return nextId(Model, tableName);
}

async function seedMongo() {
  const M = mongoModels();

  // Admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thelaunchdesk.io';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2026';
  const existingAdmin = await M.User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const hashedPass = bcrypt.hashSync(adminPass, 10);
    const id = await nextSeq(M.User, 'users');
    await M.User.create({ id, name: 'Admin', email: adminEmail, password: hashedPass, role: 'admin' });
  }

  // Departments
  const departments = [
    { code: 'LEAD', title: 'Direction', desc: 'Sets scope, owns the final call on anything client-facing, and steps in wherever a desk needs backup.', count: 1 },
    { code: 'DEV', title: 'Development', desc: 'Websites, web apps, and internal tools, built and shipped by two developers who pair on anything non-trivial.', count: 2 },
    { code: 'OPS', title: 'Client & People Management', desc: 'Keeping clients briefed, contracts clear, and the crew workload sane.', count: 2 },
    { code: 'MKT', title: 'Marketing & Growth', desc: 'Positioning, outreach, and the portfolio you are reading right now.', count: 1 },
    { code: 'SUPPORT', title: 'General Support', desc: 'The desk anyone can reach for help mid-project — questions, small fixes.', count: 1 },
    { code: 'HR', title: 'HR', desc: 'Collaboration and pair-programming mindset are essential.', count: 1 }
  ];
  for (const dept of departments) {
    const existing = await M.Department.findOne({ code: dept.code });
    if (!existing) {
      const id = await nextSeq(M.Department, 'departments');
      await M.Department.create({ id, code: dept.code, title: dept.title, description: dept.desc, head_count: dept.count });
    }
  }

  // Crew members
  const crew = [
    { name: 'Dhruv Kr. Rao', role: 'Founder & Team Lead', code: 'LEAD-01', initials: 'DKR', dept: 'LEAD', bio: 'Sets direction, signs off on scope, and takes the calls nobody else wants to.', url: 'https://dhruv-kumar-rao.vercel.app/' },
    { name: 'Divya Mali', role: 'Full-Stack Developer', code: 'DEV-01', initials: 'DM', dept: 'DEV', bio: 'Owns front-end builds and the parts of the stack clients actually click on.', url: 'https://divya-mali-dev.vercel.app/#projects' },
    { name: 'Divyanshu Giri', role: 'Backend & Infra Developer', code: 'DEV-02', initials: 'DG', dept: 'DEV', bio: 'Keeps the servers, data, and integrations quietly working in the background.', url: 'https://backenddg.netlify.app/' },
    { name: 'Manthan Sahu', role: 'Client Relations & HR', code: 'HR-01', initials: 'MS', dept: 'HR', bio: 'First point of contact for clients, and the one who onboards new crew members.', url: 'https://manthan-portfolio-pink.vercel.app/' },
    { name: 'Aditya Sinha', role: 'People & Client Management', code: 'OPS-01', initials: 'AS', dept: 'OPS', bio: 'Handles contracts, timelines, and making sure nobody is overbooked.', url: 'https://aditya-sinha-dev.vercel.app/' },
    { name: 'Madhav Kumawat', role: 'Marketing Lead', code: 'MKT-01', initials: 'MK', dept: 'MKT', bio: 'Runs outreach, socials, and the story of who we are and why it works.', url: 'https://madhav-kumawat.vercel.app/' },
    { name: 'Harshit Kumawat', role: 'General Support', code: 'SUP-01', initials: 'HK', dept: 'SUPPORT', bio: 'The first reply when anyone — client or crew — needs a quick fix or a question answered.', url: 'https://harshit-kumawat-dev.vercel.app/' }
  ];
  for (const member of crew) {
    const existing = await M.CrewMember.findOne({ code: member.code });
    if (!existing) {
      const defaultPass = bcrypt.hashSync(member.code.toLowerCase() + '@2026', 10);
      const id = await nextSeq(M.CrewMember, 'crew_members');
      await M.CrewMember.create({
        id, name: member.name, role: member.role, code: member.code, initials: member.initials,
        department: member.dept, bio: member.bio, portfolio_url: member.url, password: defaultPass
      });
    }
  }

  // Site settings
  const settings = [
    { key: 'company_name', value: 'The Launch Desk' },
    { key: 'company_tagline', value: 'Small crew. Real ops. No agency bloat.' },
    { key: 'company_email', value: 'hello@thelaunchdesk.io' },
    { key: 'projects_shipped', value: '40+' },
    { key: 'repeat_clients', value: '18' },
    { key: 'timezones', value: '03' },
    { key: 'crew_size', value: '07' }
  ];
  for (const s of settings) {
    const existing = await M.SiteSetting.findOne({ key: s.key });
    if (!existing) {
      const id = await nextSeq(M.SiteSetting, 'site_settings');
      await M.SiteSetting.create({ id, key: s.key, value: s.value });
    }
  }

  console.log('  ✅ MongoDB default data seeded');
}

module.exports = { seedMongo };
