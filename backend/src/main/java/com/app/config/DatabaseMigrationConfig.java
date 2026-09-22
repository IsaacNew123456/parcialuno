package com.app.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

/**
 * Asegura la existencia de columnas añadidas en entidades (como 'version')
 * en bases de datos PostgreSQL preexistentes.
 */
@Configuration
public class DatabaseMigrationConfig {

    private static final Logger log = LoggerFactory.getLogger(DatabaseMigrationConfig.class);
    private final DataSource dataSource;

    public DatabaseMigrationConfig(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @PostConstruct
    public void migrate() {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute("ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS version BIGINT DEFAULT 0;");
            stmt.execute("UPDATE diagrams SET version = 0 WHERE version IS NULL;");
            log.info("[DB_MIGRATION] Columna 'version' verificada/creada en tabla 'diagrams'");
        } catch (Exception e) {
            log.warn("[DB_MIGRATION] Nota en migración: {}", e.getMessage());
        }
    }
}
