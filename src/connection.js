import { Sequelize } from 'sequelize';


const sequelize = new Sequelize(
  process.env.DB_NAME || 'root',
  process.env.DB_USER || '',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'postgres', // Change to 'postgres' if using PostgreSQL
    logging: false    // Toggle to console.log to see raw SQL queries
  }
);

export default sequelize;