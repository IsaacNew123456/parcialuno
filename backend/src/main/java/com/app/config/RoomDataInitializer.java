package com.app.config;

import com.app.entities.Diagram;
import com.app.entities.Room;
import com.app.repositories.DiagramRepository;
import com.app.repositories.RoomRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.transaction.annotation.Transactional;

@Configuration
@Order(10)
public class RoomDataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(RoomDataInitializer.class);
    public static final String DEFAULT_ROOM_CODE = "1234";

    private final RoomRepository roomRepository;
    private final DiagramRepository diagramRepository;

    public RoomDataInitializer(RoomRepository roomRepository, DiagramRepository diagramRepository) {
        this.roomRepository = roomRepository;
        this.diagramRepository = diagramRepository;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!roomRepository.existsByCodeIgnoreCase(DEFAULT_ROOM_CODE)) {
            log.info("[ROOM_INITIALIZER] Inicializando sala por defecto con código '{}'...", DEFAULT_ROOM_CODE);

            String baseContentJson = """
            {
              "name": "Diagrama Base - Sala 1234",
              "classes": [
                {
                  "id": "cls_base_1",
                  "name": "Usuario",
                  "attrs": [
                    { "name": "id", "type": "Long", "version": 0 },
                    { "name": "nombre", "type": "String", "version": 0 },
                    { "name": "email", "type": "String", "version": 0 },
                    { "name": "activo", "type": "Boolean", "version": 0 }
                  ],
                  "x": 80,
                  "y": 100,
                  "version": 0
                },
                {
                  "id": "cls_base_2",
                  "name": "Rol",
                  "attrs": [
                    { "name": "id", "type": "Long", "version": 0 },
                    { "name": "nombre", "type": "String", "version": 0 },
                    { "name": "descripcion", "type": "String", "version": 0 }
                  ],
                  "x": 420,
                  "y": 100,
                  "version": 0
                }
              ],
              "relations": [
                {
                  "id": "rel_base_1",
                  "fromId": "cls_base_1",
                  "toId": "cls_base_2",
                  "sourceId": "cls_base_1",
                  "targetId": "cls_base_2",
                  "fromName": "Usuario",
                  "toName": "Rol",
                  "relationType": "association",
                  "mult": "*..1",
                  "sourceMultiplicity": "*",
                  "targetMultiplicity": "1",
                  "label": "tiene rol",
                  "version": 0
                }
              ]
            }
            """.stripIndent();

            Diagram baseDiagram = new Diagram();
            baseDiagram.setName("Diagrama Base - Sala 1234");
            baseDiagram.setContentJson(baseContentJson);
            baseDiagram.setVersion(1L);
            baseDiagram = diagramRepository.save(baseDiagram);

            Room defaultRoom = new Room();
            defaultRoom.setCode(DEFAULT_ROOM_CODE);
            defaultRoom.setName("Sala Principal Colaborativa");
            defaultRoom.setDiagram(baseDiagram);

            Room savedRoom = roomRepository.save(defaultRoom);
            log.info("[ROOM_INITIALIZER] Sala por defecto creada exitosamente: id={} code={} diagramId={}",
                    savedRoom.getId(), savedRoom.getCode(), baseDiagram.getId());
        } else {
            log.info("[ROOM_INITIALIZER] Sala por defecto '{}' ya existe en PostgreSQL.", DEFAULT_ROOM_CODE);
        }
    }
}
