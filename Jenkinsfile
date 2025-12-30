pipeline {
  agent any

  environment {
    IMAGE_NAME = 'silencecut-api'
    IMAGE_TAG = 'latest'
    REGISTRY_URL = 'visionugc.fr'
    BLUE_CONTAINER = 'silencecut-api'
  }

  stages {

    stage('Run Tests') {
      steps {
        script {
          echo 'Building test image...'
          // Build image up to dependencies stage to get environment ready
          sh 'docker build --target dependencies -t silencecut-test .'
          
          echo 'Running tests...'
          // Run tests inside the container. 
          // We copy .env.example to .env and append a dummy APP_KEY for validation.
          sh 'docker run --rm silencecut-test sh -c "cp .env.example .env && echo \'APP_KEY=cR37XUHJB-tu7jqlVrEGjY4Sbe3lQsB\' >> .env && npm test"'
        }
      }
    }

    stage('Build & Push Docker Image') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-registry-creds',
          usernameVariable: 'REGISTRY_USERNAME',
          passwordVariable: 'REGISTRY_PASSWORD'
        )]) {
          script {
            sh ('echo $REGISTRY_PASSWORD | docker login $REGISTRY_URL -u "$REGISTRY_USERNAME" --password-stdin')
            sh ('docker build -t $REGISTRY_URL/$IMAGE_NAME:$IMAGE_TAG .')
            sh ('docker push $REGISTRY_URL/$IMAGE_NAME:$IMAGE_TAG')

          }
        }
      }
    }

    stage('Blue-Green Deploy') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'docker-registry-creds',
            usernameVariable: 'REGISTRY_USERNAME',
            passwordVariable: 'REGISTRY_PASSWORD'
          )
        ]) {
          // Assure que les identifiants sont utilisés pour les commandes Docker
          script {
            def blue = env.BLUE_CONTAINER
            def appName = env.IMAGE_NAME
           
            def APP_VERSION = sh(
                script: "docker run --rm $REGISTRY_URL/$IMAGE_NAME:$IMAGE_TAG node -p \"require('./package.json').version\"",
                returnStdout: true
            ).trim()
           
            def next = "blue"

            echo "Currently live: blue, deploying to: ${next} deployed version ${APP_VERSION}"

            def nextContainer = blue
           

            // Déploie le nouveau conteneur avec les variables d'environnement
            sh """
              docker-compose -f docker-compose.prod.yaml pull ${nextContainer}
              docker-compose -f docker-compose.prod.yaml up -d ${nextContainer}
            """
            sleep 10



            echo "Switched traffic to ${next}"
          }
        }
      }
    }
  }

  post {
    always {
      sh 'docker logout $REGISTRY_URL'
      echo 'Pipeline terminé.'
    }
  }
}
