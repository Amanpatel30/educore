import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Sequelize, DataTypes } from "sequelize";
import User from "./user.js";
import Role from "./role.js";
import Permission from "./permission.js";
import RolePermission from "./rolePermission.js";
import Student from "./student.js";
import Instructor from "./instructor.js";
import Department from "./department.js";
import Course from "./course.js";
import Semester from "./semester.js";
import Enrollment from "./enrollment.js";
import UserSession from "./userSession.js";
import AdminOperation from "./adminOperation.js";
import CourseInstructor from "./courseInstructor.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = process.env.NODE_ENV || "development";

const configPath = path.join(__dirname, "../config/config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))[env];





let sequelize;

if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    {
      ...config,
      // logging: console.log,
    }
  );
}

const db = {};

db.User = User(sequelize, DataTypes);
db.Role = Role(sequelize, DataTypes);
db.Permission = Permission(sequelize, DataTypes);
db.RolePermission = RolePermission(sequelize, DataTypes);
db.Student = Student(sequelize, DataTypes);
db.Instructor = Instructor(sequelize, DataTypes);
db.Department = Department(sequelize, DataTypes);
db.Course = Course(sequelize, DataTypes);
db.Semester = Semester(sequelize, DataTypes);
db.Enrollment = Enrollment(sequelize, DataTypes);
db.UserSession = UserSession(sequelize, DataTypes);
db.AdminOperation = AdminOperation(sequelize, DataTypes);
db.CourseInstructor = CourseInstructor(sequelize, DataTypes);


// Set up all associations
Object.keys(db).forEach((modelName) => {
  if (typeof db[modelName].associate === "function") {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;