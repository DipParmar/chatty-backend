import Logger from 'bunyan';
import { config } from './config';
import mongoose from 'mongoose';

const log: Logger = config.createLogger('setupDatabase');

export default () => {
  const connect = () => {
    mongoose
      .connect(`${config.DATABASE_URL}`)
      .then(() => {
        log.info('Successfully connected to database');
      })
      .catch((error) => {
        log.error('Error connecting to database', error);
        process.exit(1);
      });
  };
  connect();
  mongoose.connection.on('disconnected', connect);
};
