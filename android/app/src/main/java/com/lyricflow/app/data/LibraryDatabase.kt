package com.lyricflow.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        SongEntity::class,
        LyricLineEntity::class,
        PlaylistEntity::class,
        PlaylistSongEntity::class,
        MigrationMetaEntity::class,
    ],
    version = 3,
    exportSchema = false,
)
abstract class LibraryDatabase : RoomDatabase() {

    abstract fun songDao(): SongDao
    abstract fun playlistDao(): PlaylistDao
    abstract fun migrationDao(): MigrationDao

    companion object {
        /**
         * Deliberately NOT "lyricflow.db" — that name belongs to the live
         * expo-sqlite file until Phase 8 cutover. Room owns a separate file;
         * the migrator copies rows across. The legacy file is never opened
         * for writing by the Compose app.
         */
        const val DB_NAME = "lyricflow-room.db"

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Lyrics payload fields required for native rich-sync parity with RN.
                db.execSQL("ALTER TABLE songs ADD COLUMN lyric_source TEXT")
                db.execSQL("ALTER TABLE songs ADD COLUMN lyrics_raw TEXT")
                db.execSQL("ALTER TABLE songs ADD COLUMN lyrics_format TEXT")
                db.execSQL("ALTER TABLE songs ADD COLUMN lyrics_sync_type TEXT")
                db.execSQL("ALTER TABLE songs ADD COLUMN lyrics_precision TEXT")
            }
        }

        /**
         * `lyrics.timestamp` INTEGER → REAL.
         *
         * The legacy column is declared INTEGER but holds fractional seconds,
         * so reading it into an Int truncated 3421 of 3461 rows and left synced
         * lyrics up to a second late. SQLite cannot change a column's type in
         * place, so the table is rebuilt; the rows are refilled by the migrator
         * on the same launch because PAYLOAD_VERSION is bumped alongside this.
         */
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("DROP TABLE IF EXISTS `lyrics`")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `lyrics` (" +
                        "`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                        "`song_id` TEXT NOT NULL, " +
                        "`timestamp` REAL NOT NULL, " +
                        "`text` TEXT NOT NULL, " +
                        "`line_order` INTEGER NOT NULL, " +
                        "FOREIGN KEY(`song_id`) REFERENCES `songs`(`id`) " +
                        "ON UPDATE NO ACTION ON DELETE CASCADE )"
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_lyrics_song_id` ON `lyrics` (`song_id`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_lyrics_timestamp` ON `lyrics` (`timestamp`)")
            }
        }

        fun build(context: Context): LibraryDatabase =
            Room.databaseBuilder(context, LibraryDatabase::class.java, DB_NAME)
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING)
                .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                .build()
    }
}
