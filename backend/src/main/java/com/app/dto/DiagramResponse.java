package com.app.dto;

import com.app.entities.Diagram;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class DiagramResponse {

    private Long id;
    private String name;
    private Instant createdAt;
    private String contentJson;
    private long version;
    private List<ClassModel> classes;
    private List<RelationModel> relations;

    public static DiagramResponse from(Diagram diagram, DiagramModel model) {
        DiagramResponse response = new DiagramResponse();
        response.setId(diagram.getId());
        response.setName(diagram.getName());
        response.setCreatedAt(diagram.getCreatedAt());
        response.setContentJson(diagram.getContentJson());
        response.setVersion(diagram.getVersion());
        if (model != null) {
            response.setClasses(model.getClasses());
            response.setRelations(model.getRelations());
        }
        return response;
    }
}
