import JSZip from 'jszip';

function toPascal(str = '') {
  if (!str) return 'Entity';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toLower(str = '') {
  if (!str) return 'entity';
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function toSnake(str = '') {
  if (!str) return 'entity';
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function mapType(t = '') {
  const m = {
    string: 'String', String: 'String',
    int: 'Integer', Integer: 'Integer', long: 'Long', Long: 'Long',
    float: 'Float', Float: 'Float', double: 'Double', Double: 'Double',
    boolean: 'Boolean', Boolean: 'Boolean',
    date: 'java.time.LocalDate', Date: 'java.time.LocalDate',
    datetime: 'Instant', Instant: 'Instant',
  };
  return m[t] || 'String';
}

function sqlType(t = '') {
  const m = {
    string: 'VARCHAR(255)', String: 'VARCHAR(255)',
    int: 'INTEGER', Integer: 'INTEGER', long: 'BIGINT', Long: 'BIGINT',
    float: 'REAL', Float: 'REAL', double: 'DOUBLE PRECISION', Double: 'DOUBLE PRECISION',
    boolean: 'BOOLEAN', Boolean: 'BOOLEAN',
    date: 'DATE', Date: 'DATE',
    datetime: 'TIMESTAMPTZ', Instant: 'TIMESTAMPTZ',
  };
  return m[t] || 'VARCHAR(255)';
}

function genPom(name) {
  const artifactId = toSnake(name).replace(/_/g, '-') || 'mi-proyecto';
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.3</version>
    <relativePath/>
  </parent>

  <groupId>com.app</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>${artifactId}</name>
  <description>Proyecto generado por CASE UML Studio</description>

  <properties>
    <java.version>17</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springdoc</groupId>
      <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
      <version>2.3.0</version>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <excludes>
            <exclude>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </exclude>
          </excludes>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function genAppProps(name) {
  const db = toSnake(name).replace(/_/g, '') || 'appdb';
  return `server.port=8080

spring.datasource.url=\${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/${db}}
spring.datasource.username=\${SPRING_DATASOURCE_USERNAME:postgres}
spring.datasource.password=\${SPRING_DATASOURCE_PASSWORD:postgres}
spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.open-in-view=false
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
`;
}

function genMain() {
  return `package com.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;
}

function genEntity(cls, relations = [], classes = []) {
  const name = toPascal(cls.name);
  const table = toSnake(cls.name);
  const attrs = (cls.attrs || [])
    .filter((a) => a.name !== 'id')
    .map((a) => {
      const javaType = mapType(a.type);
      return `    private ${javaType} ${toLower(a.name)};`;
    })
    .join('\n');

  // Relaciones ManyToOne si cls es clase intermedia N:M
  const manyToOneFields = [];
  // Relaciones OneToMany si cls es una de las clases principales
  const oneToManyFields = [];

  for (const rel of relations) {
    const from = classes.find((c) => c.id === rel.fromId || c.id === rel.sourceId);
    const to = classes.find((c) => c.id === rel.toId || c.id === rel.targetId);
    if (!from || !to) continue;

    const isInter = (rel.intermediateClassId && rel.intermediateClassId === cls.id) ||
      (rel.intermediateClassName && rel.intermediateClassName.toLowerCase() === cls.name.toLowerCase()) ||
      (rel.intermediateTableName && rel.intermediateTableName.toLowerCase() === cls.name.toLowerCase());

    if (isInter) {
      manyToOneFields.push(`    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${toSnake(from.name)}_id", nullable = false)
    private ${toPascal(from.name)} ${toLower(from.name)};

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "${toSnake(to.name)}_id", nullable = false)
    private ${toPascal(to.name)} ${toLower(to.name)};`);
    } else {
      // Verificar si cls es from o to de una relación que tiene clase intermedia
      const interClass = classes.find((c) =>
        (rel.intermediateClassId && c.id === rel.intermediateClassId) ||
        (rel.intermediateClassName && c.name.toLowerCase() === rel.intermediateClassName.toLowerCase()) ||
        (rel.intermediateTableName && c.name.toLowerCase() === rel.intermediateTableName.toLowerCase())
      );
      if (interClass && (from.id === cls.id || to.id === cls.id)) {
        const propName = toLower(cls.name);
        oneToManyFields.push(`    @OneToMany(mappedBy = "${propName}", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<${toPascal(interClass.name)}> ${toLower(interClass.name)}List = new ArrayList<>();`);
      }
    }
  }

  const extraRelations = [...manyToOneFields, ...oneToManyFields].join('\n\n');

  return `package com.app.entities;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "${table}")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ${name} {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

${attrs || '    // Sin atributos adicionales'}
${extraRelations ? '\n' + extraRelations : ''}
}
`;
}

function genRepository(cls) {
  const name = toPascal(cls.name);
  return `package com.app.repositories;

import com.app.entities.${name};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ${name}Repository extends JpaRepository<${name}, Long> {
}
`;
}

function genService(cls) {
  const name = toPascal(cls.name);
  return `package com.app.services;

import com.app.entities.${name};
import com.app.repositories.${name}Repository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.NoSuchElementException;

@Service
@RequiredArgsConstructor
public class ${name}Service {

    private final ${name}Repository repository;

    public List<${name}> findAll() {
        return repository.findAll();
    }

    public ${name} findById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("${name} no encontrado: " + id));
    }

    public ${name} save(${name} entity) {
        return repository.save(entity);
    }

    public ${name} update(Long id, ${name} updates) {
        ${name} existing = findById(id);
        return repository.save(existing);
    }

    public void delete(Long id) {
        repository.deleteById(id);
    }
}
`;
}

function genController(cls) {
  const name = toPascal(cls.name);
  const path = toSnake(cls.name).replace(/_/g, '-') + 's';
  return `package com.app.controllers;

import com.app.entities.${name};
import com.app.services.${name}Service;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/${path}")
@CrossOrigin("*")
@RequiredArgsConstructor
public class ${name}Controller {

    private final ${name}Service service;

    @GetMapping
    public ResponseEntity<List<${name}>> findAll() {
        return ResponseEntity.ok(service.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<${name}> findById(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    @PostMapping
    public ResponseEntity<${name}> create(@RequestBody ${name} entity) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.save(entity));
    }

    @PutMapping("/{id}")
    public ResponseEntity<${name}> update(@PathVariable Long id, @RequestBody ${name} entity) {
        return ResponseEntity.ok(service.update(id, entity));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
`;
}

function genSchema(classes, relations = []) {
  if (!classes || classes.length === 0) {
    return '-- No hay clases en el diagrama';
  }

  // Mapa de resolución por id y nombre en minúsculas
  const classMap = new Map();
  classes.forEach((c) => {
    classMap.set(c.id, c);
    classMap.set(c.name.toLowerCase(), c);
  });

  const getTable = (cls) => toSnake(cls.name) + 's';
  const getSingularFk = (cls) => toSnake(cls.name) + '_id';

  // Columnas FK extra que deben agregarse al CREATE TABLE
  const extraColsByClassId = new Map();
  classes.forEach((c) => extraColsByClassId.set(c.id, []));

  const foreignKeys = [];
  const junctionTables = [];

  relations.forEach((rel) => {
    const from = classMap.get(rel.fromId || rel.sourceId) || classMap.get((rel.fromName || '').toLowerCase());
    const to = classMap.get(rel.toId || rel.targetId) || classMap.get((rel.toName || '').toLowerCase());
    if (!from || !to) return;

    const relType = rel.relationType || 'association';
    const mult = rel.mult || rel.targetMultiplicity || '1..*';

    // 1. Relación Muchos a Muchos (*..*) / N:M -> Tabla Intermedia
    if (mult === '*..*' || rel.intermediateTableName) {
      const defaultName = `${from.name}_${to.name}`;
      const rawJunction = rel.intermediateTableName?.trim() || defaultName;
      const junctionName = toSnake(rawJunction);
      const fromTable = getTable(from);
      const toTable = getTable(to);
      const fromFk = getSingularFk(from);
      const toFk = getSingularFk(to);

      junctionTables.push(`-- Tabla intermedia (puente N:M) para relación ${from.name} <-> ${to.name}
CREATE TABLE IF NOT EXISTS ${junctionName} (
    ${fromFk} BIGINT NOT NULL,
    ${toFk} BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (${fromFk}, ${toFk}),
    CONSTRAINT fk_${junctionName}_${toSnake(from.name)} FOREIGN KEY (${fromFk}) REFERENCES ${fromTable}(id) ON DELETE CASCADE,
    CONSTRAINT fk_${junctionName}_${toSnake(to.name)} FOREIGN KEY (${toFk}) REFERENCES ${toTable}(id) ON DELETE CASCADE
);
`);
      return;
    }

    // 2. Herencia / Generalización (Clase Hija -> Clase Padre)
    if (relType === 'inheritance') {
      const child = from;
      const parent = to;
      const childTable = getTable(child);
      const parentTable = getTable(parent);
      const parentFk = getSingularFk(parent);

      extraColsByClassId.get(child.id)?.push(`    ${parentFk} BIGINT NOT NULL`);
      foreignKeys.push(`-- Herencia: ${child.name} extiende de ${parent.name} (Eliminación en cascada)
ALTER TABLE ${childTable}
    ADD CONSTRAINT fk_${childTable}_inherits_${toSnake(parent.name)}
    FOREIGN KEY (${parentFk}) REFERENCES ${parentTable}(id) ON DELETE CASCADE;`);
      return;
    }

    // 3. Composición (Contenedor -> Componente con ON DELETE CASCADE)
    if (relType === 'composition') {
      const container = from;
      const component = to;
      const compTable = getTable(component);
      const contTable = getTable(container);
      const contFk = getSingularFk(container);

      extraColsByClassId.get(component.id)?.push(`    ${contFk} BIGINT NOT NULL`);
      foreignKeys.push(`-- Composición: ${component.name} pertenece a ${container.name} (ON DELETE CASCADE)
ALTER TABLE ${compTable}
    ADD CONSTRAINT fk_${compTable}_comp_${toSnake(container.name)}
    FOREIGN KEY (${contFk}) REFERENCES ${contTable}(id) ON DELETE CASCADE;`);
      return;
    }

    // 4. Agregación (Contenedor -> Componente independiente con ON DELETE RESTRICT / SET NULL)
    if (relType === 'aggregation') {
      const container = from;
      const aggregated = to;
      const aggTable = getTable(aggregated);
      const contTable = getTable(container);
      const contFk = getSingularFk(container);

      extraColsByClassId.get(aggregated.id)?.push(`    ${contFk} BIGINT`);
      foreignKeys.push(`-- Agregación: ${aggregated.name} referenciado por ${container.name} (ON DELETE SET NULL / RESTRICT)
ALTER TABLE ${aggTable}
    ADD CONSTRAINT fk_${aggTable}_agg_${toSnake(container.name)}
    FOREIGN KEY (${contFk}) REFERENCES ${contTable}(id) ON DELETE RESTRICT;`);
      return;
    }

    // 5. Asociación Simple
    if (mult === '*..1') {
      const nTable = getTable(from);
      const oneTable = getTable(to);
      const oneFk = getSingularFk(to);
      extraColsByClassId.get(from.id)?.push(`    ${oneFk} BIGINT NOT NULL`);
      foreignKeys.push(`-- Asociación: ${from.name} -> ${to.name}
ALTER TABLE ${nTable}
    ADD CONSTRAINT fk_${nTable}_${toSnake(to.name)}
    FOREIGN KEY (${oneFk}) REFERENCES ${oneTable}(id) ON DELETE RESTRICT;`);
    } else {
      const nTable = getTable(to);
      const oneTable = getTable(from);
      const oneFk = getSingularFk(from);
      extraColsByClassId.get(to.id)?.push(`    ${oneFk} BIGINT NOT NULL`);
      foreignKeys.push(`-- Asociación: ${to.name} -> ${from.name}
ALTER TABLE ${nTable}
    ADD CONSTRAINT fk_${nTable}_${toSnake(from.name)}
    FOREIGN KEY (${oneFk}) REFERENCES ${oneTable}(id) ON DELETE RESTRICT;`);
    }
  });

  // Tablas principales
  const tables = classes.map((cls) => {
    const table = getTable(cls);
    const regularCols = (cls.attrs || [])
      .filter((a) => a.name.toLowerCase() !== 'id')
      .map((a) => `    ${toSnake(a.name)} ${sqlType(a.type)},`);

    const extraCols = extraColsByClassId.get(cls.id) || [];
    const allCols = [...regularCols, ...extraCols.map((c) => c + ',')];

    return `-- Entidad: ${cls.name}
CREATE TABLE IF NOT EXISTS ${table} (
    id BIGSERIAL PRIMARY KEY,
${allCols.length > 0 ? allCols.join('\n') + '\n' : ''}    created_at TIMESTAMPTZ DEFAULT NOW()
);
`;
  });

  let output = `-- ==========================================================================\n`;
  output += `-- Esquema DDL PostgreSQL · Generado por CASE UML Studio\n`;
  output += `-- Soporte semántico: Composición (CASCADE), Agregación, Herencia y N:M\n`;
  output += `-- ==========================================================================\n\n`;

  output += tables.join('\n') + '\n';

  if (junctionTables.length > 0) {
    output += `-- ==========================================================================\n`;
    output += `-- TABLAS INTERMEDIAS (RELACIONES N:M)\n`;
    output += `-- ==========================================================================\n\n`;
    output += junctionTables.join('\n') + '\n';
  }

  if (foreignKeys.length > 0) {
    output += `-- ==========================================================================\n`;
    output += `-- RESTRICCIONES DE CLAVE FORÁNEA (FOREIGN KEYS)\n`;
    output += `-- ==========================================================================\n\n`;
    output += foreignKeys.join('\n\n') + '\n';
  }

  return output;
}

function genDockerfile() {
  return `FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app
COPY . .
RUN ./mvnw -q package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
`;
}

function genDockerCompose(name) {
  const db = toSnake(name).replace(/_/g, '') || 'appdb';
  return `version: '3.9'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/${db}
      SPRING_DATASOURCE_USERNAME: postgres
      SPRING_DATASOURCE_PASSWORD: postgres
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${db}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
`;
}

export async function generateLocalZip(diagramModel) {
  const { name = 'proyecto', classes = [], relations = [] } = diagramModel;
  const zip = new JSZip();
  const base = 'src/main/java/com/app';

  zip.file('pom.xml', genPom(name));
  zip.file('docker-compose.yml', genDockerCompose(name));
  zip.file('Dockerfile', genDockerfile());

  zip.file('src/main/resources/application.properties', genAppProps(name));
  zip.file('src/main/resources/schema.sql', genSchema(classes, relations));

  zip.file(`${base}/Application.java`, genMain());

  for (const cls of classes) {
    zip.file(`${base}/entities/${toPascal(cls.name)}.java`, genEntity(cls, relations, classes));
    zip.file(`${base}/repositories/${toPascal(cls.name)}Repository.java`, genRepository(cls));
    zip.file(`${base}/services/${toPascal(cls.name)}Service.java`, genService(cls));
    zip.file(`${base}/controllers/${toPascal(cls.name)}Controller.java`, genController(cls));
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spring-boot-backend.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export function previewCode(diagramModel) {
  const { name = 'proyecto', classes = [], relations = [] } = diagramModel;
  const first = classes[0];
  return {
    'schema.sql':            genSchema(classes, relations),
    'Entity (1ª clase)':     first ? genEntity(first, relations, classes) : '// Sin clases creadas',
    'Repository':            first ? genRepository(first) : '// Sin clases creadas',
    'Service':               first ? genService(first) : '// Sin clases creadas',
    'Controller':            first ? genController(first) : '// Sin clases creadas',
    'application.properties': genAppProps(name),
    'Dockerfile':            genDockerfile(),
    'docker-compose.yml':    genDockerCompose(name),
    'pom.xml':               genPom(name),
  };
}
