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
    version = 2,
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

        fun build(context: Context): LibraryDatabase =
            Room.databaseBuilder(context, LibraryDatabase::class.java, DB_NAME)
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING)
                .addMigrations(MIGRATION_1_2)
                .build()
    }
}
